-- =============================================
-- 006_landing_leads.sql
-- Skrzynka leadów z landing page (zlecoklejanie.pl).
--
-- Landing wysyła zgłoszenia dwukanałowo: Netlify Forms + INSERT do tej tabeli.
-- Panel admina czyta ją kluczem SERVICE ROLE (omija RLS), dlatego anon ma
-- WYŁĄCZNIE prawo INSERT — nikt niezalogowany nie odczyta cudzych danych
-- kontaktowych.
--
-- Migracja jest idempotentna: bezpiecznie uruchomić na bazie, gdzie tabela
-- została już utworzona ręcznie.
-- =============================================

CREATE TABLE IF NOT EXISTS landing_leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL,                       -- 'zlecenie' | 'studio' | 'grafik'
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- surowe pola formularza
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kolumny obsługi leada (dodawane osobno — tabela mogła powstać wcześniej).
ALTER TABLE landing_leads ADD COLUMN IF NOT EXISTS status     TEXT NOT NULL DEFAULT 'new';
ALTER TABLE landing_leads ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;
ALTER TABLE landing_leads ADD COLUMN IF NOT EXISTS order_id   UUID;
ALTER TABLE landing_leads ADD COLUMN IF NOT EXISTS note       TEXT;

CREATE INDEX IF NOT EXISTS idx_landing_leads_inbox
  ON landing_leads (status, created_at DESC);

ALTER TABLE landing_leads ENABLE ROW LEVEL SECURITY;

-- Tylko INSERT dla anon/authenticated. Brak polityki SELECT = nikt poza
-- service role nie odczyta tabeli.
DROP POLICY IF EXISTS "Anon can submit leads" ON landing_leads;
CREATE POLICY "Anon can submit leads"
  ON landing_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT INSERT ON landing_leads TO anon, authenticated;
