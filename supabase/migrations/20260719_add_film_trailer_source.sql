-- Distinguish manually curated trailers from automatic TMDB/YouTube fills.
-- Unmarked legacy rows with trailer_url are treated as protected (not auto).

ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS trailer_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'films_trailer_source_check'
  ) THEN
    ALTER TABLE public.films
      ADD CONSTRAINT films_trailer_source_check
      CHECK (
        trailer_source IS NULL
        OR trailer_source IN ('manual', 'auto')
      );
  END IF;
END $$;
