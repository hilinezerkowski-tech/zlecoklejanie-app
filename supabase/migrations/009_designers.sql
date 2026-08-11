-- =============================================
-- 009_designers.sql
-- Graficy od oklejen pojazdow.
--
-- Dlaczego osobna tabela, a nie kolumna w `studios`:
-- grafik i studio to dwa rozne biznesy. Studio ma NIP, adres warsztatu,
-- marki folii i promien dojazdu. Grafik ma portfolio, oprogramowanie,
-- stawke za projekt i pracuje zdalnie na cala Polske. Wciskanie ich do
-- jednej tabeli konczy sie polem `address` z wartoscia "zdalnie".
--
-- To jest nasz glowny wyroznik: wiekszosc studiow NIE ma grafika,
-- wiec klient szuka go sam. Zaden polski konkurent tego nie kojarzy.
--
-- Migracja jest idempotentna — mozna puscic wielokrotnie.
-- =============================================

-- Status grafika — te same stany co studio, wiec admin ma jeden model myslowy.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'designer_status') THEN
    CREATE TYPE designer_status AS ENUM ('pending', 'active', 'suspended', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS designers (
  -- id = auth.users.id, tak samo jak w `studios`. Jeden user = jeden profil.
  id                        UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  display_name              TEXT NOT NULL,
  city                      TEXT,
  bio                       TEXT,

  -- Portfolio jest OBOWIAZKOWE biznesowo (walidacja w Server Action),
  -- ale kolumna jest nullowalna, zeby dalo sie zaimportowac leada bez linku.
  portfolio_url             TEXT,
  instagram                 TEXT,
  website                   TEXT,

  -- np. {'reklama na auto','flota','wrap artystyczny','livery'}
  specializations           TEXT[] DEFAULT '{}',
  -- np. {'Illustrator','CorelDRAW','Photoshop','Blender'}
  software                  TEXT[] DEFAULT '{}',

  -- Kluczowe pytanie kwalifikujace: czy grafik umie pracowac na szablonach
  -- pojazdow (bryla auta), czy robi tylko plaska grafike. To dzieli rynek na pol.
  works_on_vehicle_templates BOOLEAN NOT NULL DEFAULT FALSE,

  price_from                NUMERIC(10,2),
  price_to                  NUMERIC(10,2),
  -- Ile projektow miesiecznie jest w stanie przyjac — chroni przed
  -- kierowaniem briefow do kogos, kto i tak nie odpisze.
  monthly_capacity          INTEGER,

  status                    designer_status NOT NULL DEFAULT 'pending',
  verified_at               TIMESTAMPTZ,
  verified_note             TEXT,
  rejection_reason          TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  designers IS 'Graficy specjalizujacy sie w projektach na pojazdy.';
COMMENT ON COLUMN designers.works_on_vehicle_templates IS
  'TRUE = pracuje na szablonach bryly pojazdu, nie tylko plaska grafika.';
COMMENT ON COLUMN designers.verified_at IS
  'Data weryfikacji przez operatora (portfolio, realizacje). NULL = niezweryfikowany.';
COMMENT ON COLUMN designers.monthly_capacity IS
  'Deklarowana liczba projektow miesiecznie. Uzywane przy kierowaniu briefow.';

CREATE INDEX IF NOT EXISTS idx_designers_status ON designers (status);
CREATE INDEX IF NOT EXISTS idx_designers_city   ON designers (city);
CREATE INDEX IF NOT EXISTS idx_designers_verified ON designers (verified_at)
  WHERE verified_at IS NOT NULL;

-- updated_at — funkcja tworzona tutaj, zeby migracja byla samowystarczalna
-- (w 001 jej nie ma, a nie chcemy zaleznosci od recznych zmian w SQL Editorze).
CREATE OR REPLACE FUNCTION designers_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS designers_updated_at ON designers;
CREATE TRIGGER designers_updated_at
  BEFORE UPDATE ON designers
  FOR EACH ROW EXECUTE FUNCTION designers_set_updated_at();

-- get_my_role() powstala recznie w SQL Editorze przy naprawie rekurencji RLS
-- na `profiles`. Odtwarzamy ja tutaj (CREATE OR REPLACE), zeby migracja
-- dzialala takze na czystej bazie — np. przy stawianiu srodowiska testowego.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$fn$;

-- =============================================
-- RLS
-- =============================================
ALTER TABLE designers ENABLE ROW LEVEL SECURITY;

-- Uwaga na pulapke z poprzednich migracji: get_my_role() zwraca NULL dla
-- uzytkownika bez profilu, a NULL = 'admin' to NIE jest FALSE, tylko NULL.
-- Dlatego wszedzie coalesce().
DROP POLICY IF EXISTS "Admin manages designers"      ON designers;
DROP POLICY IF EXISTS "Designer views own record"    ON designers;
DROP POLICY IF EXISTS "Designer updates own record"  ON designers;

CREATE POLICY "Admin manages designers" ON designers
  FOR ALL
  USING      (coalesce(get_my_role() = 'admin', FALSE))
  WITH CHECK (coalesce(get_my_role() = 'admin', FALSE));

CREATE POLICY "Designer views own record" ON designers
  FOR SELECT
  USING (id = auth.uid());

-- Grafik moze edytowac swoj profil, ale NIE moze sam sobie ustawic
-- statusu ani weryfikacji — to zostaje po stronie admina (service role).
CREATE POLICY "Designer updates own record" ON designers
  FOR UPDATE
  USING      (id = auth.uid())
  WITH CHECK (id = auth.uid());

REVOKE UPDATE (status, verified_at, verified_note, rejection_reason)
  ON designers FROM authenticated;
