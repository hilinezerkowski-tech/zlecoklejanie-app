-- =============================================
-- 024c_uslugi_wymog.sql
-- Aktywny wykonawca (studio i wrapper) musi mieć min. 1 usługę core.
--
-- Odpalić DOPIERO PO deployu Fazy 2 (formularze panelu, profil studia
-- i onboarding zapisują już studios.services). Wcześniej „+ Dodaj wykonawcę”
-- i „Aktywuj” w panelu kończyłyby się błędem bazy, bo nie znają jeszcze usług.
-- =============================================

BEGIN;

-- Aktywny wykonawca musi mieć min. 1 usługę core (detailing sam nie wystarcza).
--    Blokujemy tylko: dodanie aktywnego, aktywację i zmianę usług aktywnego.
--    Stare, nieuzupełnione studia da się dalej edytować, pauzować i usuwać.
CREATE OR REPLACE FUNCTION enforce_studio_services()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  core CONSTANT TEXT[] := ARRAY['zmiana_koloru', 'detale', 'dechrom', 'ppf', 'ppf_kolor', 'reklama', 'szyby'];
BEGIN
  IF NEW.status = 'active'
     AND NEW.deleted_at IS NULL
     AND NOT (COALESCE(NEW.services, '{}') && core)
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM 'active'
       OR NEW.services IS DISTINCT FROM OLD.services
     )
  THEN
    RAISE EXCEPTION 'Aktywny wykonawca musi mieć zaznaczoną min. 1 usługę'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_studio_services ON studios;
CREATE TRIGGER enforce_studio_services
  BEFORE INSERT OR UPDATE ON studios
  FOR EACH ROW EXECUTE FUNCTION enforce_studio_services();

COMMIT;
