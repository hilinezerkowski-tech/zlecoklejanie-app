-- =============================================
-- 024b_uslugi_zlecenia.sql
-- Słownik usług — część dla zleceń (orders.service_type).
-- Wymóg usług u aktywnego wykonawcy (trigger) jest w 024c — odpalany po Fazie 2.
-- Odpalić PO deployu kodu z Fazy 1 (kod już zapisuje nowe kody, a stare
-- wartości wyświetla poprawnie) i PO 024a (nowe wartości enuma muszą być
-- zatwierdzone w osobnej transakcji).
--
-- KROK 0 — podgląd (odpal osobno, niczego nie zmienia):
--
--   SELECT id, service_type, created_at,
--          substring(description from 'Usługa \(z formularza\): [^\n]*') AS z_formularza,
--          CASE
--            WHEN service_type = 'oklejanie' AND description ILIKE '%Usługa (z formularza): Detale%' THEN 'detale'
--            WHEN service_type = 'oklejanie' THEN 'zmiana_koloru'
--            WHEN service_type = 'branding'  THEN 'reklama'
--            WHEN service_type = 'ppf' AND description ILIKE '%Usługa (z formularza): PPF kolorowy%' THEN 'ppf_kolor'
--            ELSE service_type::text
--          END AS nowa_usluga
--   FROM orders
--   WHERE service_type IN ('oklejanie', 'branding', 'ppf')
--   ORDER BY created_at;
--
-- Nic nie jest kasowane. Stare wartości ('oklejanie', 'branding') zostają
-- w typie service_type (Postgres nie usuwa wartości enuma), ale CHECK
-- nie pozwala już ich użyć.
-- =============================================

BEGIN;

-- 1) Przepisanie zleceń na kody słownika
UPDATE orders SET service_type = 'detale'
 WHERE service_type = 'oklejanie'
   AND description ILIKE '%Usługa (z formularza): Detale%';

UPDATE orders SET service_type = 'zmiana_koloru'
 WHERE service_type = 'oklejanie';

UPDATE orders SET service_type = 'reklama'
 WHERE service_type = 'branding';

UPDATE orders SET service_type = 'ppf_kolor'
 WHERE service_type = 'ppf'
   AND description ILIKE '%Usługa (z formularza): PPF kolorowy%';

-- 2) Stare wartości zablokowane, domyślnie 'inne' zamiast mylącego 'oklejanie'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_service_type_slownik;
ALTER TABLE orders
  ADD CONSTRAINT orders_service_type_slownik
  CHECK (service_type NOT IN ('oklejanie'::service_type, 'branding'::service_type));

ALTER TABLE orders ALTER COLUMN service_type SET DEFAULT 'inne';

COMMIT;
