-- 020_order_photos_anon_upload.sql
-- Landing (repo zlecoklejanie) wgrywa zdjecia zgloszenia anon kluczem BEZ konta.
-- Pozwalamy anonimowi WYLACZNIE wrzucac pliki do prefiksu leads/ w prywatnym
-- buckecie order-photos. Odczyt pozostaje zamkniety (brak polityki SELECT dla
-- anon) — pliki widoczne tylko przez signed URL generowany service_role w app.
-- Brak UPDATE/DELETE dla anon. Sciezki maja UUID (upsert=false), wiec nie mozna
-- nadpisac cudzych. Przy zatwierdzeniu leada admin kopiuje sciezki do orders.photos.

DO $$ BEGIN
  CREATE POLICY "anon upload lead photos"
    ON storage.objects
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
      bucket_id = 'order-photos'
      AND (storage.foldername(name))[1] = 'leads'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
