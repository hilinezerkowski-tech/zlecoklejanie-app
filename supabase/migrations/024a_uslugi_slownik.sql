-- =============================================
-- 024a_uslugi_slownik.sql
-- Słownik usług (src/lib/uslugi.ts) — część NIEŁAMIĄCA.
-- Odpalić PRZED deployem kodu z Fazy 1 (kod zapisuje już nowe kody usług).
--
-- 1) nowe wartości enuma service_type dla zleceń,
-- 2) kolumna studios.services (kody ze słownika, do dobierania studiów),
-- 3) indeks GIN pod filtr „studio robi usługę X”.
--
-- studios.specializations ZOSTAJE bez zmian — od teraz to „Inne usługi (opis)”,
-- wolny tekst tylko do profilu, nigdy do dobierania.
--
-- Idempotentna. ALTER TYPE ... ADD VALUE nie może działać w jednej transakcji
-- z użyciem nowej wartości — dlatego w tym pliku nowych wartości nigdzie nie używamy.
-- =============================================

ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'zmiana_koloru';
ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'detale';
ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'dechrom';
ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'ppf_kolor';
ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'reklama';
ALTER TYPE service_type ADD VALUE IF NOT EXISTS 'szyby';

ALTER TABLE studios
  ADD COLUMN IF NOT EXISTS services TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studios_services_slownik'
  ) THEN
    ALTER TABLE studios
      ADD CONSTRAINT studios_services_slownik CHECK (
        services <@ ARRAY[
          'zmiana_koloru', 'detale', 'dechrom', 'ppf', 'ppf_kolor',
          'reklama', 'szyby', 'detailing'
        ]::TEXT[]
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_studios_services ON studios USING GIN (services);

COMMENT ON COLUMN studios.services IS
  'Usługi ze słownika src/lib/uslugi.ts — jedyne źródło do dobierania studiów. specializations = wolny opis do profilu.';
