-- 016_wrapper_mobilny.sql
-- Typ konta wykonawcy: studio / freelancer (wrapper mobilny)

DO $$ BEGIN
  CREATE TYPE public.provider_type AS ENUM ('studio', 'freelancer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS provider_type  public.provider_type NOT NULL DEFAULT 'studio',
  ADD COLUMN IF NOT EXISTS instagram_url  TEXT,
  ADD COLUMN IF NOT EXISTS work_mode      TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS years_experience INT,
  ADD COLUMN IF NOT EXISTS films_used     TEXT[]  DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE public.studios
    ADD CONSTRAINT studios_freelancer_needs_ig
    CHECK (provider_type <> 'freelancer' OR instagram_url IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS studios_provider_type_idx ON public.studios (provider_type);

CREATE TABLE IF NOT EXISTS public.freelancer_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  source        TEXT NOT NULL DEFAULT 'instagram',
  handle        TEXT,
  name          TEXT,
  city          TEXT,
  phone         TEXT,
  instagram_url TEXT,
  score         SMALLINT,
  status        TEXT NOT NULL DEFAULT 'nowy',
  contacted_at  TIMESTAMPTZ,
  notes         TEXT
);

ALTER TABLE public.freelancer_leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin all freelancer_leads" ON public.freelancer_leads
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
