-- =============================================
-- 027_google_rating_at.sql
-- Data stanu oceny Google przy profilu wykonawcy.
--
-- Ocena Google jest pokazywana OSOBNO od opinii portalu i opisana jako nieweryfikowana
-- przez nas („Ocena z Google: 4,9 (N opinii, stan na <data>)”). Kolumna google_rating_at
-- mówi, kiedy ocenę ostatnio odczytano. Puste = profil pokazuje ocenę bez daty.
-- Kod jest odporny na brak kolumny (profil się wyświetli), ale odpal przed merge Etapu 1.
-- Idempotentna, nic nie kasuje.
-- =============================================
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS google_rating_at timestamptz;
COMMENT ON COLUMN public.studios.google_rating_at IS 'Kiedy odczytano google_rating / google_reviews_count (do „stan na <data>” na profilu).';
