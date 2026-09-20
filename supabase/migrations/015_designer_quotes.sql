-- =============================================
-- 015_designer_quotes.sql
-- Faza 2 doboru grafika: wycena grafika -> wybor klienta -> wymiana
-- kontaktu i czat. Lustro toru studia (quotes / choose_quote /
-- get_order_contact / order_messages), ale na OSOBNYM torze.
--
-- ZASADA: wybor grafika jest niezalezny od wyboru studia.
-- `orders.status` i `orders.chosen_quote_id` naleza do toru STUDIA i ta
-- migracja ich nie dotyka. Stan toru grafika trzyma `designer_quotes.status`.
--
-- Migracja ADDYTYWNA i idempotentna. Wymaga migracji 014.
-- URUCHOMIC PRZED wdrozeniem kodu.
-- =============================================

-- ---------------------------------------------
-- 1. Wyceny grafikow
-- Jeden grafik = jedna wycena do zlecenia (moze ja poprawiac, dopoki
-- klient nie wybral). Wycena istnieje tylko dla przypisanego briefu.
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.designer_quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES public.orders(id)    ON DELETE CASCADE,
  designer_id    UUID NOT NULL REFERENCES public.designers(id) ON DELETE CASCADE,
  assignment_id  UUID NOT NULL REFERENCES public.order_designer_assignments(id) ON DELETE CASCADE,
  price_min      INTEGER NOT NULL CHECK (price_min >= 0),
  price_max      INTEGER CHECK (price_max IS NULL OR price_max >= price_min),
  estimated_days INTEGER CHECK (estimated_days IS NULL OR estimated_days > 0),
  comment        TEXT,
  status         TEXT NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent', 'chosen', 'rejected')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, designer_id)
);

COMMENT ON TABLE public.designer_quotes IS
  'Wyceny grafikow. Tor rownolegly do quotes (studia) — wybor jest niezalezny.';

CREATE INDEX IF NOT EXISTS idx_designer_quotes_order
  ON public.designer_quotes (order_id, created_at);

-- Na jedno zlecenie moze byc tylko JEDEN wybrany grafik.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_designer_quote_chosen
  ON public.designer_quotes (order_id)
  WHERE status = 'chosen';

-- ---------------------------------------------
-- 2. Czat klient <-> grafik
-- Rozmowa = para (zlecenie, grafik), istnieje dopiero po wycenie.
-- Kopia zasad z migracji 012 (czat ze studiem).
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_designer_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id)     ON DELETE CASCADE,
  designer_id UUID NOT NULL REFERENCES public.designers(id)  ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'designer')),
  body        TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_odm_thread
  ON public.order_designer_messages (order_id, designer_id, created_at);

-- ---------------------------------------------
-- 3. Rola wywolujacego w rozmowie: 'client' | 'designer' | 'admin' | NULL
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.designer_thread_role(p_order_id uuid, p_designer_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  IF coalesce(get_my_role() = 'admin', false) THEN
    RETURN 'admin';
  END IF;

  -- Rozmowa istnieje dopiero, gdy grafik wyslal wycene
  IF NOT EXISTS (
    SELECT 1 FROM designer_quotes q
     WHERE q.order_id = p_order_id AND q.designer_id = p_designer_id
  ) THEN
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM orders o WHERE o.id = p_order_id AND o.client_id = v_uid) THEN
    RETURN 'client';
  END IF;

  IF p_designer_id = v_uid THEN
    RETURN 'designer';
  END IF;

  RETURN NULL;
END;
$fn$;

-- ---------------------------------------------
-- 4. Czy w rozmowie mozna jeszcze pisac
-- Po wyborze grafika pisze tylko wybrany. Zlecenie zamkniete = odczyt.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.designer_thread_open(p_order_id uuid, p_designer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN o.status IN ('completed', 'cancelled') THEN false
    WHEN EXISTS (
      SELECT 1 FROM designer_quotes q
       WHERE q.order_id = p_order_id AND q.status = 'chosen'
    ) THEN EXISTS (
      SELECT 1 FROM designer_quotes q
       WHERE q.order_id = p_order_id
         AND q.designer_id = p_designer_id
         AND q.status = 'chosen'
    )
    ELSE true
  END
  FROM orders o
  WHERE o.id = p_order_id;
$fn$;

-- ---------------------------------------------
-- 5. RLS
--
-- designer_quotes: grafik czyta i WSTAWIA swoje (tylko do zlecenia, do
-- ktorego dostal brief). Zmiana statusu idzie wylacznie przez RPC
-- choose_designer_quote — brak polityki UPDATE dla grafika, wiec nie
-- wybierze sam siebie. Poprawki wyceny robi backend kluczem service role.
-- ---------------------------------------------
ALTER TABLE public.designer_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Designer reads own quotes" ON public.designer_quotes;
CREATE POLICY "Designer reads own quotes" ON public.designer_quotes
  FOR SELECT USING (designer_id = auth.uid());

DROP POLICY IF EXISTS "Designer sends own quote" ON public.designer_quotes;
CREATE POLICY "Designer sends own quote" ON public.designer_quotes
  FOR INSERT
  WITH CHECK (
    designer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM order_designer_assignments a
       WHERE a.id = assignment_id
         AND a.order_id = designer_quotes.order_id
         AND a.designer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Client reads designer quotes on own orders" ON public.designer_quotes;
CREATE POLICY "Client reads designer quotes on own orders" ON public.designer_quotes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.client_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admin reads designer quotes" ON public.designer_quotes;
CREATE POLICY "Admin reads designer quotes" ON public.designer_quotes
  FOR SELECT USING (coalesce(get_my_role() = 'admin', false));

-- Czat: strony rozmowy i admin czytaja; pisza tylko strony, przy otwartej rozmowie.
ALTER TABLE public.order_designer_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Thread parties and admin read designer messages" ON public.order_designer_messages;
CREATE POLICY "Thread parties and admin read designer messages" ON public.order_designer_messages
  FOR SELECT
  USING (designer_thread_role(order_id, designer_id) IS NOT NULL);

DROP POLICY IF EXISTS "Thread parties post designer messages" ON public.order_designer_messages;
CREATE POLICY "Thread parties post designer messages" ON public.order_designer_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_role = designer_thread_role(order_id, designer_id)
    AND coalesce(designer_thread_open(order_id, designer_id), false)
  );

-- ---------------------------------------------
-- 6. Wybor grafika przez klienta
-- Nie rusza orders.status ani orders.chosen_quote_id — to tor studia.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.choose_designer_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order_id    uuid;
  v_designer_id uuid;
  v_client_id   uuid;
  v_status      order_status;
BEGIN
  SELECT q.order_id, q.designer_id
    INTO v_order_id, v_designer_id
    FROM public.designer_quotes q
   WHERE q.id = p_quote_id;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Wycena nie istnieje';
  END IF;

  SELECT o.client_id, o.status
    INTO v_client_id, v_status
    FROM public.orders o
   WHERE o.id = v_order_id;

  IF v_client_id IS NULL OR v_client_id <> auth.uid() THEN
    RAISE EXCEPTION 'Brak uprawnien do tego zlecenia';
  END IF;

  IF v_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'To zlecenie jest juz zamkniete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.designer_quotes q
     WHERE q.order_id = v_order_id AND q.status = 'chosen'
  ) THEN
    RAISE EXCEPTION 'Grafik do tego zlecenia zostal juz wybrany';
  END IF;

  UPDATE public.designer_quotes
     SET status = 'rejected', updated_at = now()
   WHERE order_id = v_order_id AND id <> p_quote_id;

  UPDATE public.designer_quotes
     SET status = 'chosen', updated_at = now()
   WHERE id = p_quote_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_designer_id,
    'chosen',
    'Klient wybral Twoja wycene projektu',
    'Skontaktuj sie z klientem, zeby ustalic szczegoly projektu.',
    jsonb_build_object('order_id', v_order_id, 'designer_quote_id', p_quote_id)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.choose_designer_quote(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.choose_designer_quote(uuid) TO authenticated;

-- ---------------------------------------------
-- 7. Wymiana kontaktu klient <-> wybrany grafik
-- Kontakt wydajemy DOPIERO po wyborze — przed nim grafik nie zna klienta
-- (zasada Fazy 1) i nie da sie ominac platformy.
-- ---------------------------------------------
DROP FUNCTION IF EXISTS public.get_order_designer_contact(uuid);

CREATE FUNCTION public.get_order_designer_contact(p_order_id uuid)
RETURNS TABLE (
  party        text,   -- czyj to kontakt: 'designer' albo 'client'
  display_name text,
  email        text,
  phone        text,
  location     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_client_id   uuid;
  v_status      order_status;
  v_designer_id uuid;
  v_caller      uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Brak zalogowanego uzytkownika';
  END IF;

  SELECT o.client_id, o.status
    INTO v_client_id, v_status
    FROM public.orders o
   WHERE o.id = p_order_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Zlecenie nie istnieje';
  END IF;

  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  SELECT q.designer_id
    INTO v_designer_id
    FROM public.designer_quotes q
   WHERE q.order_id = p_order_id AND q.status = 'chosen'
   LIMIT 1;

  IF v_designer_id IS NULL THEN
    RETURN;
  END IF;

  IF v_caller = v_client_id THEN
    RETURN QUERY
    SELECT
      'designer'::text,
      coalesce(nullif(d.display_name, ''), p.full_name, 'Wybrany grafik')::text,
      p.email::text,
      p.phone::text,
      coalesce(d.city, p.city)::text
    FROM public.profiles p
    LEFT JOIN public.designers d ON d.id = p.id
    WHERE p.id = v_designer_id;

  ELSIF v_caller = v_designer_id THEN
    RETURN QUERY
    SELECT
      'client'::text,
      coalesce(nullif(p.full_name, ''), 'Klient')::text,
      p.email::text,
      p.phone::text,
      coalesce(o.city, p.city)::text
    FROM public.profiles p
    JOIN public.orders o ON o.id = p_order_id
    WHERE p.id = v_client_id;

  ELSE
    RAISE EXCEPTION 'Brak uprawnien do tego zlecenia';
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.get_order_designer_contact(uuid) IS
  'Wydaje kontakt drugiej strony po wyborze grafika. Tylko dla klienta i wybranego grafika.';

REVOKE ALL ON FUNCTION public.get_order_designer_contact(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_order_designer_contact(uuid) TO authenticated;

-- ---------------------------------------------
-- 8. Klient musi widziec, kto zlozyl wycene
-- `designers` nie ma zadnej polityki dla klienta, wiec bez tego zamiast
-- nazwy grafika widzialby pusto. Lustro polityki "Public can view active
-- studios". Tabela nie zawiera kontaktu (e-mail i telefon sa w `profiles`,
-- dostepne dopiero przez get_order_designer_contact po wyborze).
-- ---------------------------------------------
DROP POLICY IF EXISTS "Authenticated can view active designers" ON public.designers;
CREATE POLICY "Authenticated can view active designers" ON public.designers
  FOR SELECT
  USING (status = 'active');
