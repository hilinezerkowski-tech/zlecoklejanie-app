-- Test triggera enforce_studio_services (migracja 024c) — Bramka 2 briefu usług.
-- Odpalić w SQL Editorze PO 024c. Niczego nie zmienia: blok kończy się celowym
-- RAISE EXCEPTION z raportem, więc Postgres cofa wszystkie zmiany z testu.
-- Oczekiwany wynik: wszystkie linie „OK”.

DO $$
DECLARE
  stare_id UUID;   -- aktywne studio bez usług (stare, nieuzupełnione)
  pelne_id UUID;   -- aktywne studio z usługą core
  wynik TEXT := '';
BEGIN
  SELECT id INTO stare_id FROM studios
   WHERE status = 'active' AND deleted_at IS NULL AND services = '{}' LIMIT 1;
  SELECT id INTO pelne_id FROM studios
   WHERE status = 'active' AND deleted_at IS NULL
     AND services && ARRAY['zmiana_koloru','detale','dechrom','ppf','ppf_kolor','reklama','szyby'] LIMIT 1;
  IF stare_id IS NULL OR pelne_id IS NULL THEN
    RAISE EXCEPTION 'Brak danych do testu (stare_id=%, pelne_id=%)', stare_id, pelne_id;
  END IF;

  -- 1. Stare studio bez usług da się edytować (usługi bez zmian)
  BEGIN
    UPDATE studios SET business_name = business_name WHERE id = stare_id;
    wynik := wynik || E'\n1 edycja starego bez usług: OK';
  EXCEPTION WHEN check_violation THEN
    wynik := wynik || E'\n1 edycja starego bez usług: BŁĄD — zablokowane, a nie powinno';
  END;

  -- 2. Stare studio da się zawiesić…
  BEGIN
    UPDATE studios SET status = 'suspended' WHERE id = stare_id;
    wynik := wynik || E'\n2 zawieszenie starego bez usług: OK';
  EXCEPTION WHEN check_violation THEN
    wynik := wynik || E'\n2 zawieszenie starego bez usług: BŁĄD — zablokowane';
  END;

  -- 3. …ale nie da się go aktywować z powrotem bez usług
  BEGIN
    UPDATE studios SET status = 'active' WHERE id = stare_id;
    wynik := wynik || E'\n3 aktywacja bez usług: BŁĄD — przeszło, a powinno być zablokowane';
  EXCEPTION WHEN check_violation THEN
    wynik := wynik || E'\n3 aktywacja bez usług: OK (zablokowane)';
  END;

  -- 4. Aktywnemu nie da się wyczyścić usług
  BEGIN
    UPDATE studios SET services = '{}' WHERE id = pelne_id;
    wynik := wynik || E'\n4 wyczyszczenie usług aktywnego: BŁĄD — przeszło';
  EXCEPTION WHEN check_violation THEN
    wynik := wynik || E'\n4 wyczyszczenie usług aktywnego: OK (zablokowane)';
  END;

  -- 5. Sam detailing nie wystarcza
  BEGIN
    UPDATE studios SET services = '{detailing}' WHERE id = pelne_id;
    wynik := wynik || E'\n5 sam detailing: BŁĄD — przeszło';
  EXCEPTION WHEN check_violation THEN
    wynik := wynik || E'\n5 sam detailing: OK (zablokowane)';
  END;

  -- 6. Zmiana usług na inne core — przechodzi
  BEGIN
    UPDATE studios SET services = '{szyby}' WHERE id = pelne_id;
    wynik := wynik || E'\n6 zmiana usług na inne core: OK';
  EXCEPTION WHEN check_violation THEN
    wynik := wynik || E'\n6 zmiana usług na inne core: BŁĄD — zablokowane';
  END;

  -- 7. Słownik: nieznany kod odrzuca CHECK z 024a
  BEGIN
    UPDATE studios SET services = '{ppf,xyz}' WHERE id = pelne_id;
    wynik := wynik || E'\n7 nieznany kod usługi: BŁĄD — przeszło';
  EXCEPTION WHEN check_violation THEN
    wynik := wynik || E'\n7 nieznany kod usługi: OK (zablokowane)';
  END;

  RAISE EXCEPTION 'WYNIK TESTU 024c (wszystko cofnięte):%', wynik;
END $$;
