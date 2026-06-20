-- Normalized film identity fields and exact-duplicate protection for new inserts

CREATE OR REPLACE FUNCTION public.normalize_film_title(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result text;
BEGIN
  IF input IS NULL OR length(btrim(input)) = 0 THEN
    RETURN NULL;
  END IF;

  result := lower(btrim(input));
  result := regexp_replace(
    result,
    E'[\u0027\u2018\u2019\u201C\u201D]',
    '',
    'g'
  );
  result := regexp_replace(result, '\s*&\s*', ' and ', 'g');
  result := regexp_replace(result, '[^a-z0-9\s]+', ' ', 'g');
  result := regexp_replace(result, '\s+', ' ', 'g');
  result := btrim(result);
  result := regexp_replace(
    result,
    '^(the|a|an|le|la|les|l|el|los|las|un|une|des|der|die|das)\s+',
    '',
    'g'
  );
  result := btrim(result);

  RETURN NULLIF(result, '');
END;
$$;

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS normalized_title text,
  ADD COLUMN IF NOT EXISTS normalized_original_title text,
  ADD COLUMN IF NOT EXISTS tmdb_id integer,
  ADD COLUMN IF NOT EXISTS imdb_id text;

UPDATE films
SET
  normalized_title = COALESCE(normalized_title, normalize_film_title(title)),
  normalized_original_title = COALESCE(
    normalized_original_title,
    normalize_film_title(original_title)
  );

CREATE OR REPLACE FUNCTION public.films_set_normalized_titles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_title := normalize_film_title(NEW.title);
  NEW.normalized_original_title := normalize_film_title(NEW.original_title);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS films_normalized_titles_trigger ON films;

CREATE TRIGGER films_normalized_titles_trigger
  BEFORE INSERT OR UPDATE OF title, original_title ON films
  FOR EACH ROW
  EXECUTE FUNCTION public.films_set_normalized_titles();

CREATE OR REPLACE FUNCTION public.films_prevent_exact_duplicate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.normalized_title IS NOT NULL AND NEW.year IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.films AS existing
      WHERE existing.normalized_title = NEW.normalized_title
        AND existing.year = NEW.year
        AND existing.id IS DISTINCT FROM NEW.id
    ) THEN
      RAISE EXCEPTION 'duplicate film: normalized title and year already exist'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS films_prevent_exact_duplicate_trigger ON films;

CREATE TRIGGER films_prevent_exact_duplicate_trigger
  BEFORE INSERT OR UPDATE OF title, original_title, year ON films
  FOR EACH ROW
  EXECUTE FUNCTION public.films_prevent_exact_duplicate();

CREATE INDEX IF NOT EXISTS films_normalized_title_year_idx
  ON public.films (normalized_title, year);

CREATE UNIQUE INDEX IF NOT EXISTS films_tmdb_id_unique
  ON public.films (tmdb_id)
  WHERE tmdb_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS films_imdb_id_unique
  ON public.films (imdb_id)
  WHERE imdb_id IS NOT NULL;
