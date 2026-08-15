-- Allow multiple score artifacts per film (native + cross_media).
-- Hosted profile_film_scores historically used PRIMARY KEY (profile_id, film_id)
-- without a surrogate id, which blocks score_mode/source_media partitioning.

ALTER TABLE public.profile_film_scores
  ADD COLUMN IF NOT EXISTS id uuid;

UPDATE public.profile_film_scores
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.profile_film_scores
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.profile_film_scores
  ALTER COLUMN id SET NOT NULL;

DO $$
DECLARE
  pk_name text;
  pk_cols text;
BEGIN
  SELECT c.conname, pg_get_constraintdef(c.oid)
  INTO pk_name, pk_cols
  FROM pg_constraint c
  WHERE c.conrelid = 'public.profile_film_scores'::regclass
    AND c.contype = 'p'
  LIMIT 1;

  IF pk_name IS NOT NULL AND pk_cols !~* '\(.*\bid\b.*\)' THEN
    EXECUTE format('ALTER TABLE public.profile_film_scores DROP CONSTRAINT %I', pk_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profile_film_scores'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.profile_film_scores
      ADD CONSTRAINT profile_film_scores_pkey PRIMARY KEY (id);
  END IF;
END $$;

ALTER TABLE public.profile_film_scores
  DROP CONSTRAINT IF EXISTS profile_film_scores_profile_id_film_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profile_film_scores_profile_film_mode_source_unique'
  ) THEN
    ALTER TABLE public.profile_film_scores
      ADD CONSTRAINT profile_film_scores_profile_film_mode_source_unique
      UNIQUE (profile_id, film_id, score_mode, source_media);
  END IF;
END $$;
