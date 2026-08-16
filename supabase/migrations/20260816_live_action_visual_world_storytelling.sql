-- Live-action native taste axes: Visual World + Storytelling.
-- Moods unchanged. Aesthetic/material columns & embeddings retained for rollback.
-- Animation scoring path stays on emotional + material.

-- 1) Film tag columns
ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS visual_world_tags text[];

ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS storytelling_tags text[];

-- 2) Discovery staging (new LA enrichment)
ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS visual_world_tags text[];

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS storytelling_tags text[];

-- 3) Embeddings
CREATE TABLE IF NOT EXISTS public.film_visual_world_embeddings (
  film_id uuid PRIMARY KEY REFERENCES public.films (id) ON DELETE CASCADE,
  visual_world_text text,
  embedding jsonb NOT NULL,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.film_storytelling_embeddings (
  film_id uuid PRIMARY KEY REFERENCES public.films (id) ON DELETE CASCADE,
  storytelling_text text,
  embedding jsonb NOT NULL,
  updated_at timestamptz
);

ALTER TABLE public.film_visual_world_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.film_storytelling_embeddings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.film_visual_world_embeddings FROM anon, authenticated;
REVOKE ALL ON TABLE public.film_storytelling_embeddings FROM anon, authenticated;
GRANT ALL ON TABLE public.film_visual_world_embeddings TO service_role;
GRANT ALL ON TABLE public.film_storytelling_embeddings TO service_role;

-- 4) Score components (nullable; animation leaves them null/0)
ALTER TABLE public.profile_film_scores
  ADD COLUMN IF NOT EXISTS visual_world_score numeric;

ALTER TABLE public.profile_film_scores
  ADD COLUMN IF NOT EXISTS storytelling_score numeric;

UPDATE public.profile_film_scores
SET
  visual_world_score = COALESCE(visual_world_score, 0),
  storytelling_score = COALESCE(storytelling_score, 0)
WHERE visual_world_score IS NULL OR storytelling_score IS NULL;

ALTER TABLE public.profile_film_scores
  ALTER COLUMN visual_world_score SET DEFAULT 0;

ALTER TABLE public.profile_film_scores
  ALTER COLUMN storytelling_score SET DEFAULT 0;

-- 5) Taste-core profile tags for the new axes
ALTER TABLE public.profile_taste_cores
  ADD COLUMN IF NOT EXISTS visual_world_profile_tags text[];

ALTER TABLE public.profile_taste_cores
  ADD COLUMN IF NOT EXISTS storytelling_profile_tags text[];

-- 6) Atomic replace includes new score columns
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
      visual_world_score,
      storytelling_score,
      score_mode,
      source_media,
      computed_at
    )
    SELECT
      job_profile_id,
      score_row.film_id,
      score_row.emotional_score,
      score_row.material_score,
      COALESCE(score_row.visual_world_score, 0),
      COALESCE(score_row.storytelling_score, 0),
      COALESCE(score_row.score_mode, 'native'),
      COALESCE(score_row.source_media, 'animation'),
      score_row.computed_at
    FROM jsonb_to_recordset(score_rows) AS score_row(
      film_id uuid,
      emotional_score numeric,
      material_score numeric,
      visual_world_score numeric,
      storytelling_score numeric,
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
