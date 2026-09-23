-- 018_reviews.sql
-- Opinie i oceny wykonawcow (studia + wrapperzy).
-- Model moderacji: klient dodaje opinie (status 'pending'), admin ja publikuje.
-- Publicznie widoczne tylko 'published' (RLS). Srednia liczona z published.

CREATE TABLE IF NOT EXISTS public.reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id    UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  order_id     UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  author_name  TEXT NOT NULL,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'published', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS reviews_studio_id_idx ON public.reviews (studio_id);
CREATE INDEX IF NOT EXISTS reviews_status_idx    ON public.reviews (status);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Publiczny odczyt: tylko opublikowane opinie.
DO $$ BEGIN
  CREATE POLICY "Public can view published reviews" ON public.reviews
    FOR SELECT USING (status = 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Kazdy moze zlozyc opinie, ale wylacznie jako 'pending' (moderacja przez admina).
DO $$ BEGIN
  CREATE POLICY "Anyone can submit pending review" ON public.reviews
    FOR INSERT WITH CHECK (status = 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin: pelny dostep (moderacja, publikacja, usuwanie).
DO $$ BEGIN
  CREATE POLICY "Admin full access reviews" ON public.reviews
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
