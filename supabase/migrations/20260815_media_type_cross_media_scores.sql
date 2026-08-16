-- Partition catalog + taste/scoring by media type; add native vs cross-media scores.
-- Existing rows backfill to animation / native so current ranking is unchanged.

-- 1) films.media_type
ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS media_type text;

UPDATE public.films
SET media_type = 'animation'
WHERE media_type IS NULL;

ALTER TABLE public.films
  ALTER COLUMN media_type SET DEFAULT 'animation';

ALTER TABLE public.films
  ALTER COLUMN media_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'films_media_type_check'
  ) THEN
    ALTER TABLE public.films
      ADD CONSTRAINT films_media_type_check
      CHECK (media_type IN ('animation', 'live_action'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS films_media_type_idx
  ON public.films (media_type);

-- 2) profile_taste_cores.media_type
ALTER TABLE public.profile_taste_cores
  ADD COLUMN IF NOT EXISTS media_type text;

UPDATE public.profile_taste_cores
SET media_type = 'animation'
WHERE media_type IS NULL;

ALTER TABLE public.profile_taste_cores
  ALTER COLUMN media_type SET DEFAULT 'animation';

ALTER TABLE public.profile_taste_cores
  ALTER COLUMN media_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profile_taste_cores_media_type_check'
  ) THEN
    ALTER TABLE public.profile_taste_cores
      ADD CONSTRAINT profile_taste_cores_media_type_check
      CHECK (media_type IN ('animation', 'live_action'));
  END IF;
END $$;

ALTER TABLE public.profile_taste_cores
  DROP CONSTRAINT IF EXISTS profile_taste_cores_profile_id_core_type_core_index_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profile_taste_cores_profile_media_type_core_unique'
  ) THEN
    ALTER TABLE public.profile_taste_cores
      ADD CONSTRAINT profile_taste_cores_profile_media_type_core_unique
      UNIQUE (profile_id, media_type, core_type, core_index);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profile_taste_cores_profile_media_idx
  ON public.profile_taste_cores (profile_id, media_type);

-- 3) profile_film_scores: score_mode + source_media
ALTER TABLE public.profile_film_scores
  ADD COLUMN IF NOT EXISTS score_mode text;

ALTER TABLE public.profile_film_scores
  ADD COLUMN IF NOT EXISTS source_media text;

UPDATE public.profile_film_scores
SET
  score_mode = COALESCE(score_mode, 'native'),
  source_media = COALESCE(source_media, 'animation')
WHERE score_mode IS NULL OR source_media IS NULL;

ALTER TABLE public.profile_film_scores
  ALTER COLUMN score_mode SET DEFAULT 'native';

ALTER TABLE public.profile_film_scores
  ALTER COLUMN source_media SET DEFAULT 'animation';

ALTER TABLE public.profile_film_scores
  ALTER COLUMN score_mode SET NOT NULL;

ALTER TABLE public.profile_film_scores
  ALTER COLUMN source_media SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profile_film_scores_score_mode_check'
  ) THEN
    ALTER TABLE public.profile_film_scores
      ADD CONSTRAINT profile_film_scores_score_mode_check
      CHECK (score_mode IN ('native', 'cross_media'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profile_film_scores_source_media_check'
  ) THEN
    ALTER TABLE public.profile_film_scores
      ADD CONSTRAINT profile_film_scores_source_media_check
      CHECK (source_media IN ('animation', 'live_action'));
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

CREATE INDEX IF NOT EXISTS profile_film_scores_profile_mode_source_idx
  ON public.profile_film_scores (profile_id, score_mode, source_media);

-- 4) Atomic replace includes score_mode + source_media
CREATE OR REPLACE FUNCTION public.replace_profile_film_scores_if_current(
  job_profile_id uuid,
  job_generation bigint,
  score_rows jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_generation bigint;
  current_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(job_profile_id::text, 0)
  );

  SELECT generation, status
  INTO current_generation, current_status
  FROM public.profile_score_rebuild_jobs
  WHERE profile_id = job_profile_id;

  IF current_generation IS DISTINCT FROM job_generation
     OR current_status IS DISTINCT FROM 'running' THEN
    RETURN false;
  END IF;

  BEGIN
    DELETE FROM public.profile_film_scores
    WHERE profile_id = job_profile_id;

    INSERT INTO public.profile_film_scores (
      profile_id,
      film_id,
      emotional_score,
      material_score,
      score_mode,
      source_media,
      computed_at
    )
    SELECT
      job_profile_id,
      score_row.film_id,
      score_row.emotional_score,
      score_row.material_score,
      COALESCE(score_row.score_mode, 'native'),
      COALESCE(score_row.source_media, 'animation'),
      score_row.computed_at
    FROM jsonb_to_recordset(score_rows) AS score_row(
      film_id uuid,
      emotional_score numeric,
      material_score numeric,
      score_mode text,
      source_media text,
      computed_at timestamptz
    );

    UPDATE public.profile_score_rebuild_jobs
    SET
      status = 'completed',
      locked_at = NULL,
      last_error = NULL,
      updated_at = now()
    WHERE profile_id = job_profile_id
      AND generation = job_generation
      AND status = 'running';

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'ZX001';
    END IF;

    RETURN true;
  EXCEPTION
    WHEN SQLSTATE 'ZX001' THEN
      RETURN false;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_profile_film_scores_if_current(uuid, bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_profile_film_scores_if_current(uuid, bigint, jsonb)
  TO service_role;
