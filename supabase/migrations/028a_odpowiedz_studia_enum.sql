-- =============================================
-- 028a_odpowiedz_studia_enum.sql  (Etap 2 ulepszeń — krok 1 z 2)
-- Nowe wartości statusu przypisania:
--   declined = studio samo odmówiło (przycisk „Nie wezmę tego zlecenia”)
--   expired  = studio nie odpowiedziało w terminie (cron)
-- UWAGA: `rejected` nadal znaczy „klient wybrał inne studio” — nie mieszać znaczeń.
--
-- ODPAL TO OSOBNO i dopiero POTEM 028b: nowej wartości enuma nie da się użyć
-- w tej samej transakcji, w której ją dodano (ten sam powód co 024a → 024b).
-- Idempotentna, nic nie kasuje.
-- =============================================
ALTER TYPE assignment_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE assignment_status ADD VALUE IF NOT EXISTS 'expired';
