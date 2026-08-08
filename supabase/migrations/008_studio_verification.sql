-- =============================================
-- 008_studio_verification.sql
-- Odznaka "Zweryfikowane studio" — przewaga nad Fixly/Oferteo, gdzie
-- wykonawca placi za dostep i nikt go nie sprawdza.
--
-- `status = 'active'` mowi tylko, ze studio moze skladac wyceny.
-- `verified_at` mowi, ze ktos fizycznie potwierdzil firme: NIP w CEIDG/KRS,
-- adres warsztatu, realizacje. To dwie rozne rzeczy i klient widzi tylko te druga.
--
-- Migracja jest idempotentna.
-- =============================================

ALTER TABLE studios ADD COLUMN IF NOT EXISTS verified_at   TIMESTAMPTZ;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS verified_note TEXT;

COMMENT ON COLUMN studios.verified_at IS
  'Data weryfikacji firmy przez operatora. NULL = niezweryfikowane.';
COMMENT ON COLUMN studios.verified_note IS
  'Co dokladnie sprawdzono (NIP, adres, realizacje) — notatka wewnetrzna.';

CREATE INDEX IF NOT EXISTS idx_studios_verified ON studios (verified_at)
  WHERE verified_at IS NOT NULL;
