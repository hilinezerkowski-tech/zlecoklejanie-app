-- =============================================
-- 030_studio_cover.sql
-- Zdjęcie okładkowe studia do karty w katalogu (/wykonawcy), gdy studio nie ma jeszcze portfolio.
-- cover_url = og:image ze strony www studia (pobierane przez admina), cover_source = skąd.
-- Portfolio wgrane przez studio ma zawsze pierwszeństwo przed cover_url.
-- Idempotentna, nic nie kasuje.
-- =============================================
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS cover_source text;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS cover_checked_at timestamptz;
COMMENT ON COLUMN public.studios.cover_url IS 'Okładka karty katalogu z og:image strony www studia. Fallback, gdy portfolio puste.';
