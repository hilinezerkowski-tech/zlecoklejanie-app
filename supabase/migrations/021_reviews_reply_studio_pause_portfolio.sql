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
