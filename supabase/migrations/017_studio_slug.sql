-- 017_studio_slug.sql
-- Automatyczna generacja sluga dla profilu publicznego /wykonawca/{slug}.
-- Kolumna studios.slug (TEXT UNIQUE) istnieje od 001, ale nic jej nie wypełniało.
-- Trigger nadaje slug przy INSERT oraz przy zmianie business_name, o ile slug
-- jest jeszcze pusty (slug pozostaje staly po utworzeniu — nie psujemy linkow/SEO).

-- Zamiana tekstu na slug: male litery, polskie znaki -> ASCII, reszta -> myslnik.
CREATE OR REPLACE FUNCTION public.slugify(v TEXT)
RETURNS TEXT AS $$
  SELECT trim(BOTH '-' FROM
    regexp_replace(
      regexp_replace(
        lower(translate(
          coalesce(v, ''),
          'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ',
          'acelnoszzacelnoszz'
        )),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    ));
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.studios_set_slug()
RETURNS TRIGGER AS $$
DECLARE
  base      TEXT;
  candidate TEXT;
  n         INT := 0;
BEGIN
  IF new.slug IS NOT NULL AND new.slug <> '' THEN
    RETURN new;
  END IF;

  base := public.slugify(new.business_name);
  IF base = '' THEN
    base := 'wykonawca';
  END IF;

  candidate := base;
  WHILE EXISTS (
    SELECT 1 FROM public.studios s
    WHERE s.slug = candidate AND s.id <> new.id
  ) LOOP
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;

  new.slug := candidate;
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studios_set_slug ON public.studios;
CREATE TRIGGER trg_studios_set_slug
  BEFORE INSERT OR UPDATE OF business_name ON public.studios
  FOR EACH ROW
  EXECUTE FUNCTION public.studios_set_slug();

DO $$
DECLARE
  r         RECORD;
  base      TEXT;
  candidate TEXT;
  n         INT;
BEGIN
  FOR r IN
    SELECT id, business_name FROM public.studios
    WHERE slug IS NULL OR slug = ''
  LOOP
    base := public.slugify(r.business_name);
    IF base = '' THEN
      base := 'wykonawca';
    END IF;
    candidate := base;
    n := 0;
    WHILE EXISTS (
      SELECT 1 FROM public.studios s
      WHERE s.slug = candidate AND s.id <> r.id
    ) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;
    UPDATE public.studios SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;
