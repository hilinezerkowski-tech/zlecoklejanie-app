-- =============================================
-- 013_studio_admin.sql
-- Panel admina: miekkie usuwanie studia + wiadomosci admin -> studio.
--
-- Migracja ADDYTYWNA i idempotentna: 1 nowa kolumna, 1 nowa tabela.
-- Nie rusza istniejacych danych ani polityk. Nie zalezy od 011/012.
-- URUCHOMIC PRZED wdrozeniem kodu — kod filtruje po studios.deleted_at.
-- =============================================

-- ---------------------------------------------
-- 1. Miekkie usuwanie studia
-- NULL = zywe; data = ukryte przez admina. Rekord, wyceny i zlecenia zostaja.
-- ---------------------------------------------
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.studios.deleted_at IS
  'Miekkie usuwanie: NULL = aktywne; data = ukryte przez admina, dane zachowane.';

CREATE INDEX IF NOT EXISTS studios_not_deleted_idx
  ON public.studios (id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------
-- 2. Wiadomosci admin -> studio (wpis w panelu + opcjonalna kopia mailem)
-- channel:      'both' (mail + panel) | 'email' (tylko mail) | 'panel' (tylko apka)
-- email_status: log wysylki maila ('sent' / 'failed' / 'skipped')
-- read_at:      kiedy studio odczytalo wiadomosc w panelu
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.studio_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id     uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  subject       text,
  body          text NOT NULL,
  channel       text NOT NULL DEFAULT 'both'
                  CHECK (channel IN ('both','email','panel')),
  email_status  text
                  CHECK (email_status IN ('sent','failed','skipped')),
  email_error   text,
  created_by    text,          -- e-mail admina, ktory wyslal
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz    -- NULL = nieodczytane przez studio
);

COMMENT ON TABLE public.studio_messages IS
  'Wiadomosci od administratora do studia (kanal panelu + kopia mailem).';

CREATE INDEX IF NOT EXISTS studio_messages_studio_idx
  ON public.studio_messages (studio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS studio_messages_unread_idx
  ON public.studio_messages (studio_id)
  WHERE read_at IS NULL;

-- ---------------------------------------------
-- 3. RLS
-- Baza MA wlaczone RLS (studios, orders, quotes, email_log, order_messages...).
-- Tabela w schemacie public BEZ RLS jest czytelna i zapisywalna kluczem anon,
-- czyli kazdy moglby czytac korespondencje i podszywac sie pod admina.
-- Mapowanie wlasciciela jest znane: studios.id = profiles.id = auth.uid().
--
-- Tylko SELECT: wstawianie i oznaczanie read_at robi backend kluczem
-- service_role (omija RLS), wiec studio nie moze edytowac tresci wiadomosci.
-- ---------------------------------------------
ALTER TABLE public.studio_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Studio reads own admin messages" ON public.studio_messages;
CREATE POLICY "Studio reads own admin messages" ON public.studio_messages
  FOR SELECT
  USING (studio_id = auth.uid());

-- coalesce: get_my_role() zwraca NULL dla konta bez profilu (patrz 009)
DROP POLICY IF EXISTS "Admin reads studio messages" ON public.studio_messages;
CREATE POLICY "Admin reads studio messages" ON public.studio_messages
  FOR SELECT
  USING (coalesce(get_my_role() = 'admin', false));
