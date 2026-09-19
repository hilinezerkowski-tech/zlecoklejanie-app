-- =============================================
-- 011_email_log.sql
-- Historia powiadomien (e-mail) — kto, kiedy, co dostal.
--
-- PROBLEM: po wyslaniu maila przez Resend nie bylo w panelu zadnego sladu.
-- Pytanie "czy klient dostal info o wycenie?" wymagalo grzebania w logach
-- Resend na innym koncie.
--
-- ROZWIAZANIE: kazda proba wysylki (udana, nieudana, pominieta) zapisuje
-- wiersz tutaj. Zapis robi serwer kluczem service role (omija RLS).
-- Odczyt: tylko admin. Tabela nie przechowuje tresci maila — tylko temat.
--
-- Migracja jest idempotentna (mozna uruchomic ponownie).
-- =============================================

CREATE TABLE IF NOT EXISTS email_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Powiazania (oba opcjonalne — np. mail powitalny studia nie ma zlecenia)
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
  lead_id        UUID REFERENCES landing_leads(id) ON DELETE SET NULL,
  -- Typ zdarzenia: assigned | quoted | chosen_studio | chosen_client |
  --                lead_admin_alert | lead_autoreply | studio_welcome | designer_welcome
  event          TEXT NOT NULL,
  recipient      TEXT NOT NULL,
  -- client | studio | designer | admin | lead
  recipient_role TEXT,
  subject        TEXT NOT NULL,
  -- sent = przyjete przez Resend | failed = blad Resend/sieci | skipped = brak klucza API
  status         TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider_id    TEXT,          -- ID wiadomosci w Resend (do szukania w ich logach)
  error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_log_order ON email_log (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_lead  ON email_log (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_time  ON email_log (created_at DESC);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Tylko admin czyta. coalesce(): get_my_role() zwraca NULL dla uzytkownika
-- bez profilu, a NULL = 'admin' daje NULL, nie FALSE (patrz 009).
DROP POLICY IF EXISTS "Admin reads email log" ON email_log;
CREATE POLICY "Admin reads email log" ON email_log
  FOR SELECT
  USING (coalesce(get_my_role() = 'admin', false));

-- Brak polityk INSERT/UPDATE/DELETE = nikt poza service role nie pisze.
