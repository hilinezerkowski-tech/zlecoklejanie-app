-- 021: C2 (odpowiedz na opinie) + D3 (pauza leadow) + D2 (portfolio)

-- C2: odpowiedz studia na opinie
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS reply     TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS reply_at  TIMESTAMPTZ;

-- D3: pauza leadow (studio wstrzymuje otrzymywanie przypisan)
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false;

-- D2: portfolio realizacji (lista {url, path}); publiczny bucket na zdjecia
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS portfolio JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public)
VALUES ('studio-portfolio', 'studio-portfolio', true)
ON CONFLICT (id) DO NOTHING;

-- Polityki storage dla bucketu studio-portfolio (defense-in-depth; upload z panelu
-- idzie service_role, ale zamykamy tez sciezke bezposrednia).
DO $$ BEGIN
  CREATE POLICY "studio-portfolio public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'studio-portfolio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "studio-portfolio owner write"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'studio-portfolio'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "studio-portfolio owner delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'studio-portfolio'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
