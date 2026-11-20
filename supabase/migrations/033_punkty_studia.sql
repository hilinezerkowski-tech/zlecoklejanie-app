-- =============================================
-- 033_punkty_studia.sql
-- Gate 1, Faza 1: płatność za wycenę w modelu punktowym (brief „Gate 1 — płatność za wycenę").
--
-- 1 punkt = 1 wysłana wycena. „Odrzuć" jest darmowe. Przypisanie jest darmowe.
-- Każde aktywne studio (stare z backfillu, nowe przy aktywacji) dostaje punkty startowe.
--
-- PRZEŁĄCZNIK: app_settings 'platne_wyceny' (domyślnie WYŁ.). Przy WYŁ. wyceny nie zużywają
-- punktów — punkty startowe i tak są nadawane, żeby po włączeniu każdy miał saldo.
-- Regulamin (§ Opłaty) wymaga ogłoszenia opłat wykonawcom min. 30 dni przed włączeniem.
--
-- Zużycie punktu liczy BAZA (trigger BEFORE INSERT na quotes), nie aplikacja: wycena z panelu
-- idzie z przeglądarki (RLS), wycena z linku /o/<token> kluczem service role — trigger łapie obie
-- drogi i jest odporny na wyścig (UPDATE ... WHERE saldo > 0).
--
-- Przy okazji: studio mogło przez API zmienić sobie status (np. pending → active) i inne pola
-- admina. Trigger studios_chron_pola blokuje to dla sesji samego studia.
--
-- Migracja idempotentna. Uruchamia Wojtek w SQL Editorze.
-- =============================================

-- ---------------------------------------------
-- 1. Ustawienia (nie nadpisują istniejących)
-- ---------------------------------------------
INSERT INTO public.app_settings (key, value)
VALUES
  ('platne_wyceny', '{"wlaczona": false}'::jsonb),
  ('punkty', '{"start": 10, "pakiet_punkty": null, "pakiet_cena_zl": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------
-- 2. Tabele
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.punkty_studia (
  studio_id               uuid PRIMARY KEY REFERENCES public.studios(id) ON DELETE CASCADE,
  saldo                   int  NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  -- Studio zwolnione z opłat (Hiline). Celowo TU, nie w studios: studio może edytować swój wiersz studios.
  zwolnione               boolean NOT NULL DEFAULT false,
  zrodlo_ostatniej_zmiany text,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Historia każdej zmiany salda (wyciąg punktów). Na nią wskazuje quotes.punkty_id_transakcji.
CREATE TABLE IF NOT EXISTS public.punkty_ruchy (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id   uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  zmiana      int  NOT NULL,
  saldo_po    int  NOT NULL,
  zrodlo      text NOT NULL CHECK (zrodlo IN ('start_gratis', 'platnosc_p24', 'zuzycie_wyceny', 'korekta')),
  quote_id    uuid,            -- bez FK: ruch powstaje w BEFORE INSERT, zanim wiersz wyceny istnieje
  platnosc_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS punkty_ruchy_studio_idx ON public.punkty_ruchy (studio_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platnosci (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id       uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  kwota           numeric(10,2) NOT NULL CHECK (kwota > 0),   -- zł brutto
  punkty_kupione  int  NOT NULL CHECK (punkty_kupione > 0),
  p24_session_id  text UNIQUE,
  p24_order_id    bigint,
  status          text NOT NULL DEFAULT 'oczekuje' CHECK (status IN ('oczekuje', 'zaplacono', 'blad')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  zaplacono_at    timestamptz
);
CREATE INDEX IF NOT EXISTS platnosci_studio_idx ON public.platnosci (studio_id, created_at DESC);

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS punkt_zuzyty boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS punkty_id_transakcji uuid REFERENCES public.punkty_ruchy(id);

-- ---------------------------------------------
-- 3. RLS — studio widzi tylko swoje; zapis wyłącznie przez funkcje bazy / service role
-- ---------------------------------------------
ALTER TABLE public.punkty_studia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punkty_ruchy  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platnosci     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Studio widzi swoje saldo" ON public.punkty_studia;
CREATE POLICY "Studio widzi swoje saldo" ON public.punkty_studia FOR SELECT USING (studio_id = auth.uid());
DROP POLICY IF EXISTS "Admin widzi salda" ON public.punkty_studia;
CREATE POLICY "Admin widzi salda" ON public.punkty_studia FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Studio widzi swoje ruchy" ON public.punkty_ruchy;
CREATE POLICY "Studio widzi swoje ruchy" ON public.punkty_ruchy FOR SELECT USING (studio_id = auth.uid());
DROP POLICY IF EXISTS "Admin widzi ruchy" ON public.punkty_ruchy;
CREATE POLICY "Admin widzi ruchy" ON public.punkty_ruchy FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Studio widzi swoje platnosci" ON public.platnosci;
CREATE POLICY "Studio widzi swoje platnosci" ON public.platnosci FOR SELECT USING (studio_id = auth.uid());
DROP POLICY IF EXISTS "Admin widzi platnosci" ON public.platnosci;
CREATE POLICY "Admin widzi platnosci" ON public.platnosci FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------
-- 4. Punkty startowe — przy aktywacji (każda droga: panel, agent, auto-onboarding, SQL)
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.nadaj_punkty_startowe(p_studio uuid, p_migracja boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_start int;
  v_ruch  uuid;
BEGIN
  -- Tylko raz na studio: ponowna aktywacja po zawieszeniu nie dokłada punktów.
  IF EXISTS (SELECT 1 FROM punkty_studia WHERE studio_id = p_studio) THEN
    RETURN;
  END IF;
  SELECT GREATEST(COALESCE((value->>'start')::int, 10), 0) INTO v_start FROM app_settings WHERE key = 'punkty';
  v_start := COALESCE(v_start, 10);

  INSERT INTO punkty_studia (studio_id, saldo, zrodlo_ostatniej_zmiany)
  VALUES (p_studio, v_start, 'start_gratis')
  ON CONFLICT (studio_id) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO punkty_ruchy (studio_id, zmiana, saldo_po, zrodlo)
  VALUES (p_studio, v_start, v_start, 'start_gratis')
  RETURNING id INTO v_ruch;

  INSERT INTO admin_actions (admin_id, entity, action, entity_id, payload, result)
  VALUES (NULL, 'punkty', 'start_gratis', p_studio::text,
          jsonb_build_object('punkty', v_start, 'saldoPo', v_start, 'ruchId', v_ruch, 'migracja', p_migracja), 'ok');
END;
$fn$;

-- Funkcja SECURITY DEFINER nie może być wołana z przeglądarki (RPC) — tylko z triggera / SQL.
REVOKE EXECUTE ON FUNCTION public.nadaj_punkty_startowe(uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_punkty_przy_aktywacji()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    PERFORM nadaj_punkty_startowe(NEW.id, false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Punkty nie mogą zablokować aktywacji studia.
  RAISE WARNING 'nadaj_punkty_startowe failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_punkty_przy_aktywacji ON public.studios;
CREATE TRIGGER trg_punkty_przy_aktywacji
  AFTER INSERT OR UPDATE OF status ON public.studios
  FOR EACH ROW EXECUTE FUNCTION public.trg_punkty_przy_aktywacji();

-- ---------------------------------------------
-- 5. Zużycie punktu przy zapisie wyceny
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_zuzyj_punkt_za_wycene()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_wlaczone  boolean;
  v_zwolnione boolean;
  v_saldo     int;
  v_ruch      uuid;
BEGIN
  SELECT COALESCE((value->>'wlaczona')::boolean, false) INTO v_wlaczone FROM app_settings WHERE key = 'platne_wyceny';
  IF NOT COALESCE(v_wlaczone, false) THEN
    RETURN NEW;
  END IF;

  SELECT zwolnione INTO v_zwolnione FROM punkty_studia WHERE studio_id = NEW.studio_id;
  IF COALESCE(v_zwolnione, false) THEN
    RETURN NEW;
  END IF;

  UPDATE punkty_studia
     SET saldo = saldo - 1, zrodlo_ostatniej_zmiany = 'zuzycie_wyceny', updated_at = now()
   WHERE studio_id = NEW.studio_id AND saldo > 0
  RETURNING saldo INTO v_saldo;

  IF v_saldo IS NULL THEN
    -- Aplikacja rozpoznaje ten kod i pokazuje ekran doładowania.
    RAISE EXCEPTION 'BRAK_PUNKTOW: studio nie ma punktów na wycenę' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO punkty_ruchy (studio_id, zmiana, saldo_po, zrodlo, quote_id)
  VALUES (NEW.studio_id, -1, v_saldo, 'zuzycie_wyceny', NEW.id)
  RETURNING id INTO v_ruch;

  NEW.punkt_zuzyty := true;
  NEW.punkty_id_transakcji := v_ruch;

  INSERT INTO admin_actions (admin_id, entity, action, entity_id, payload, result)
  VALUES (NULL, 'punkty', 'zuzycie_wyceny', NEW.studio_id::text,
          jsonb_build_object('orderId', NEW.order_id, 'quoteId', NEW.id, 'saldoPo', v_saldo, 'ruchId', v_ruch), 'ok');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_zuzyj_punkt_za_wycene ON public.quotes;
CREATE TRIGGER trg_zuzyj_punkt_za_wycene
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_zuzyj_punkt_za_wycene();

-- ---------------------------------------------
-- 6. Ochrona pól admina w studios przed zmianą przez samo studio
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_studios_chron_pola()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- Tylko sesja właściciela wiersza. Service role (auth.uid() NULL) i admin przechodzą.
  IF auth.uid() IS NULL OR auth.uid() <> OLD.id THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_note IS DISTINCT FROM OLD.verified_note
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.google_rating IS DISTINCT FROM OLD.google_rating
     OR NEW.google_rating_at IS DISTINCT FROM OLD.google_rating_at
     OR NEW.google_reviews_count IS DISTINCT FROM OLD.google_reviews_count THEN
    RAISE EXCEPTION 'To pole zmienia tylko administrator.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_studios_chron_pola ON public.studios;
CREATE TRIGGER trg_studios_chron_pola
  BEFORE UPDATE ON public.studios
  FOR EACH ROW EXECUTE FUNCTION public.trg_studios_chron_pola();

-- ---------------------------------------------
-- 7. Backfill: obecne aktywne studia dostają punkty startowe; Hiline zwolnione
-- ---------------------------------------------
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.studios WHERE status = 'active' AND deleted_at IS NULL LOOP
    PERFORM public.nadaj_punkty_startowe(r.id, true);
  END LOOP;
END
$do$;

UPDATE public.punkty_studia ps
   SET zwolnione = true
  FROM public.studios s
 WHERE s.id = ps.studio_id AND s.slug = 'hiline-wrap-detailing' AND ps.zwolnione = false;

-- Kontrola: ile studiów dostało punkty, ile aktywnych bez punktów (powinno być 0).
SELECT
  (SELECT count(*) FROM public.punkty_studia) AS studia_z_punktami,
  (SELECT count(*) FROM public.studios s WHERE s.status = 'active' AND s.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.punkty_studia p WHERE p.studio_id = s.id)) AS aktywne_bez_punktow,
  (SELECT count(*) FROM public.punkty_studia WHERE zwolnione) AS zwolnione;
