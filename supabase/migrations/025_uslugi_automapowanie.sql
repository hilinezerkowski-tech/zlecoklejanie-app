-- =============================================
-- 025_uslugi_automapowanie.sql
-- Faza 1c: jednoznaczne przepisanie studios.specializations → studios.services.
-- Wygenerowane: node scripts/automapowanie-uslug.mjs (reguły w skrypcie).
-- Odpalić PO 024a. studios.specializations NIE jest zmieniane.
-- Każdy UPDATE ma warunek services = '{}' — nie nadpisze usług zaznaczonych ręcznie.
-- Wiersze „do sprawdzenia” są na dole w komentarzu — decyzja Wojtka.
-- =============================================

BEGIN;

UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'reklama']::TEXT[] WHERE id = '27e42f02-3652-4414-91fe-8145dc183c08' AND services = '{}'; -- Oklejanie Aut Tarnobrzeg
UPDATE studios SET services = ARRAY['ppf', 'detailing']::TEXT[] WHERE id = '672f5d67-98a8-4166-b44b-6a8db4e096af' AND services = '{}'; -- Detail Story
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf']::TEXT[] WHERE id = '50bdd340-14b4-43ec-8ce1-9b88c2f1e1bb' AND services = '{}'; -- RS CAR DESIGN
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'reklama']::TEXT[] WHERE id = 'e4b5740b-d465-436c-a781-c2fdbb8ab6e7' AND services = '{}'; -- Detailing System
UPDATE studios SET services = ARRAY['ppf', 'detailing']::TEXT[] WHERE id = 'c5190618-4643-4f2b-9205-8f4406fcc053' AND services = '{}'; -- Prestige-Detailing
UPDATE studios SET services = ARRAY['ppf', 'detailing']::TEXT[] WHERE id = '39d05e2e-639b-4192-96b0-b76466534f1b' AND services = '{}'; -- Hangar 052
UPDATE studios SET services = ARRAY['ppf', 'detailing']::TEXT[] WHERE id = '6492ea7d-dead-4490-962c-d872e5675b4d' AND services = '{}'; -- One Man Army Detailing
UPDATE studios SET services = ARRAY['zmiana_koloru', 'reklama']::TEXT[] WHERE id = '18a910ea-78c8-4673-a34d-ac0efafaa312' AND services = '{}'; -- Wrapthecar.eu
UPDATE studios SET services = ARRAY['ppf']::TEXT[] WHERE id = '6297b30a-4d02-49a8-b8a2-fafa08b9a989' AND services = '{}'; -- Rafał Gozdera
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf']::TEXT[] WHERE id = '49e3673c-6e3f-4212-86de-5443a825471b' AND services = '{}'; -- Max Media / superoklejony.pl
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'detailing']::TEXT[] WHERE id = '7ff66d25-c0d7-4b84-a612-63b4924b3239' AND services = '{}'; -- Silent Ride
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf']::TEXT[] WHERE id = '9c5536df-0ce2-4ab3-97ba-e46361a45f72' AND services = '{}'; -- WrapMania
UPDATE studios SET services = ARRAY['zmiana_koloru', 'dechrom', 'ppf', 'reklama', 'szyby', 'detailing']::TEXT[] WHERE id = '1d751a71-db40-4d78-a9d7-d095b4ce5c78' AND services = '{}'; -- Unique Car Studio
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'szyby']::TEXT[] WHERE id = 'dab4c230-224d-49aa-a0a5-47c2d446ffdf' AND services = '{}'; -- Bartłomiej Gryglik
UPDATE studios SET services = ARRAY['zmiana_koloru', 'dechrom', 'ppf', 'detailing']::TEXT[] WHERE id = 'c5c78c3c-258b-4430-840a-fbc1f8a18791' AND services = '{}'; -- Steam Wash Auto Detailing
UPDATE studios SET services = ARRAY['zmiana_koloru', 'dechrom', 'ppf', 'reklama']::TEXT[] WHERE id = '4abb0889-39d2-4826-bb55-baf3ce81c975' AND services = '{}'; -- PRODETAILING STUDIO
UPDATE studios SET services = ARRAY['ppf', 'detailing']::TEXT[] WHERE id = '8572403e-25b5-47d6-b259-e82b683cbc94' AND services = '{}'; -- Prime Auto Care
UPDATE studios SET services = ARRAY['reklama']::TEXT[] WHERE id = '1f31ed29-f12a-413e-86ed-a0af6abe9eba' AND services = '{}'; -- MOTION-ART Sp. z o.o.
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'szyby', 'detailing']::TEXT[] WHERE id = 'cdb50ece-8292-49eb-bb51-80f3aa5f61ce' AND services = '{}'; -- PeliCar Wrap
UPDATE studios SET services = ARRAY['reklama']::TEXT[] WHERE id = 'e4e676be-08a8-4cd0-9c5d-70e691b9252e' AND services = '{}'; -- Piotr Krukowski
UPDATE studios SET services = ARRAY['ppf', 'reklama', 'szyby']::TEXT[] WHERE id = '547dc7fe-78ee-4921-bb6f-8539f5e1c353' AND services = '{}'; -- Elite Car Design
UPDATE studios SET services = ARRAY['ppf', 'detailing']::TEXT[] WHERE id = '58120987-dcec-40a7-a044-02661e637236' AND services = '{}'; -- CarOdnowa
UPDATE studios SET services = ARRAY['szyby', 'detailing']::TEXT[] WHERE id = '51b72abb-1401-483f-9b61-e2efc6a03709' AND services = '{}'; -- Hot Cars Wrap
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'reklama', 'szyby']::TEXT[] WHERE id = 'ddd31d9a-8478-4045-8887-35dcb0add1f5' AND services = '{}'; -- Oklejam.com
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'reklama', 'szyby']::TEXT[] WHERE id = '3fed0dfb-c563-42f6-9563-e789b59f1de8' AND services = '{}'; -- Wrap Collabo
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'reklama', 'detailing']::TEXT[] WHERE id = '0933061b-dd27-47df-a53a-8db89ae698df' AND services = '{}'; -- ERES Garage
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'reklama', 'szyby']::TEXT[] WHERE id = '3dac1d8c-d618-43de-bbc6-39bf5f1018d6' AND services = '{}'; -- Hiline Wrap & Detailing
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'reklama']::TEXT[] WHERE id = '77eb7ba0-fbb3-465c-8e5a-c17f89781352' AND services = '{}'; -- Onyx Wrap
UPDATE studios SET services = ARRAY['ppf', 'ppf_kolor', 'szyby', 'detailing']::TEXT[] WHERE id = '68a0a72d-5770-41c9-9719-b3fbe8dbf132' AND services = '{}'; -- Opti Design Gawron Łukasz
UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'detailing']::TEXT[] WHERE id = '12d38971-556f-4412-97f0-1de4e5624ff5' AND services = '{}'; -- Garaż SPA
UPDATE studios SET services = ARRAY['ppf', 'ppf_kolor', 'detailing']::TEXT[] WHERE id = '5cdb0c2f-3418-4b53-9e22-c89e0d5cc4f9' AND services = '{}'; -- Diamentowy Połysk Auto Spa & Car Detailing
UPDATE studios SET services = ARRAY['ppf', 'detailing']::TEXT[] WHERE id = '2c55fe99-ccf7-4fb7-b738-3e5981c2bc12' AND services = '{}'; -- IGOR POLERUJE / Auto Detailing - Powłoki Ceramiczne, Korekta lakieru, PPF
UPDATE studios SET services = ARRAY['zmiana_koloru', 'dechrom', 'ppf', 'szyby', 'detailing']::TEXT[] WHERE id = 'ece376d6-4936-47b2-91c1-3dbb27e2e3ca' AND services = '{}'; -- Studio2m KolorBryki

-- Dojazd do klienta → work_mode (cecha, nie usługa)
UPDATE studios SET work_mode = array_append(COALESCE(work_mode, '{}'), 'u_klienta') WHERE id = 'e4e676be-08a8-4cd0-9c5d-70e691b9252e' AND NOT ('u_klienta' = ANY(COALESCE(work_mode, '{}'))); -- Piotr Krukowski

COMMIT;

-- ---------------------------------------------
-- DO SPRAWDZENIA (niejednoznaczne) — odkomentuj wybraną wersję:
-- DAB CAR: PPF; zmiana koloru PPF; powłoki ceramiczne; szkolenia PPF
-- UPDATE studios SET services = ARRAY['ppf', 'ppf_kolor', 'detailing']::TEXT[] WHERE id = '18ad9383-4508-4bb7-89da-ae60e1684d97' AND services = '{}';
-- TintWrap: oklejanie reklamowe; projektowanie; PPF; zmiana koloru PPF; XPEL; przyciemnianie szyb; folie okienne; laminaty architektoniczne
-- UPDATE studios SET services = ARRAY['ppf', 'ppf_kolor', 'reklama', 'szyby']::TEXT[] WHERE id = 'dd14d857-8f3c-48f8-8ed0-bf6a0e612deb' AND services = '{}';
-- Luxecoat: zmiana koloru / PPF; przyciemnianie szyb/ korekta lakieru / ceramika
-- UPDATE studios SET services = ARRAY['ppf_kolor', 'szyby', 'detailing']::TEXT[] WHERE id = 'e7cba0fe-424c-4633-acae-49e953c94bbd' AND services = '{}';
-- HotPoint PPF & Detailing: PPF; zmiana koloru PPF; zmiana koloru vinyl; oklejenia reklamowe; korekty lakieru; powłoki elastomerowe; grafeny/ceramiki; usuwanie wgnieceń PDR
-- UPDATE studios SET services = ARRAY['zmiana_koloru', 'ppf', 'ppf_kolor', 'reklama', 'detailing']::TEXT[] WHERE id = '07da5a03-ba16-47cf-9610-4322fd97b739' AND services = '{}';
-- AutoClinic: Zmiana kolor PPF; folie ochronne PPF; powłoki ochronne; autodetailing
-- UPDATE studios SET services = ARRAY['ppf', 'ppf_kolor', 'detailing']::TEXT[] WHERE id = '2bb976e9-2715-424a-8f9b-7b5a60a611a3' AND services = '{}';

-- Kontrola po odpaleniu:
-- SELECT business_name, services, specializations FROM studios WHERE deleted_at IS NULL ORDER BY cardinality(services), business_name;
