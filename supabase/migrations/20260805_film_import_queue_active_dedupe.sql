-- Active-queue dedupe for film_import_queue.
-- queue_key mirrors films hard-duplicate identity: normalize_film_title(title) || ':' || year
-- (same normalize_film_title used by films_prevent_exact_duplicate).

ALTER TABLE public.film_import_queue
  ADD COLUMN IF NOT EXISTS queue_key text,
  ADD COLUMN IF NOT EXISTS tmdb_id integer;

UPDATE public.film_import_queue
SET
  queue_key = normalize_film_title(title) || ':' || year::text,
  tmdb_id = COALESCE(
    tmdb_id,
    NULLIF(
      substring(payload #>> '{source_urls,tmdb}' FROM '/movie/([0-9]+)'),
      ''
    )::integer
  )
WHERE queue_key IS NULL;

ALTER TABLE public.film_import_queue
  ALTER COLUMN queue_key SET NOT NULL;

CREATE OR REPLACE FUNCTION public.film_import_queue_set_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tmdb_url text;
  tmdb_match text;
BEGIN
  NEW.queue_key := normalize_film_title(NEW.title) || ':' || NEW.year::text;

  IF NEW.tmdb_id IS NULL AND NEW.payload IS NOT NULL THEN
    tmdb_url := NEW.payload #>> '{source_urls,tmdb}';
    IF tmdb_url IS NOT NULL THEN
      tmdb_match := substring(tmdb_url FROM '/movie/([0-9]+)');
      IF tmdb_match IS NOT NULL AND tmdb_match <> '' THEN
        NEW.tmdb_id := tmdb_match::integer;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS film_import_queue_set_identity_trigger
  ON public.film_import_queue;

CREATE TRIGGER film_import_queue_set_identity_trigger
  BEFORE INSERT OR UPDATE OF title, year, payload, tmdb_id
  ON public.film_import_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.film_import_queue_set_identity();

-- Only one active (pending/processing) row per identity.
CREATE UNIQUE INDEX IF NOT EXISTS film_import_queue_active_queue_key_uidx
  ON public.film_import_queue (queue_key)
  WHERE status IN ('pending', 'processing');

CREATE UNIQUE INDEX IF NOT EXISTS film_import_queue_active_tmdb_uidx
  ON public.film_import_queue (tmdb_id)
  WHERE status IN ('pending', 'processing')
    AND tmdb_id IS NOT NULL;
