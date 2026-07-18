-- Queue profile score rebuilds from rating changes.
-- The trigger makes enqueueing durable and independent of the web request.

CREATE TABLE IF NOT EXISTS public.profile_score_rebuild_jobs (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed')),
  generation bigint NOT NULL DEFAULT 1,
  attempts integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_score_rebuild_jobs_due_idx
  ON public.profile_score_rebuild_jobs (status, scheduled_at);

ALTER TABLE public.profile_score_rebuild_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profile_score_rebuild_jobs FROM anon, authenticated;
GRANT ALL ON TABLE public.profile_score_rebuild_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_profile_score_rebuild()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_profile_id uuid;
BEGIN
  changed_profile_id := COALESCE(NEW.profile_id, OLD.profile_id);

  INSERT INTO public.profile_score_rebuild_jobs (
    profile_id,
    scheduled_at,
    status,
    generation,
    attempts,
    locked_at,
    last_error,
    updated_at
  )
  VALUES (
    changed_profile_id,
    now() + interval '60 seconds',
    'pending',
    1,
    0,
    NULL,
    NULL,
    now()
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    scheduled_at = EXCLUDED.scheduled_at,
    status = 'pending',
    generation = profile_score_rebuild_jobs.generation + 1,
    attempts = 0,
    locked_at = NULL,
    last_error = NULL,
    updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS film_ratings_enqueue_profile_score_rebuild_insert_delete
  ON public.film_ratings;
DROP TRIGGER IF EXISTS film_ratings_enqueue_profile_score_rebuild_update
  ON public.film_ratings;

CREATE TRIGGER film_ratings_enqueue_profile_score_rebuild_insert_delete
  AFTER INSERT OR DELETE ON public.film_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_profile_score_rebuild();

CREATE TRIGGER film_ratings_enqueue_profile_score_rebuild_update
  AFTER UPDATE OF rating ON public.film_ratings
  FOR EACH ROW
  WHEN (OLD.rating IS DISTINCT FROM NEW.rating)
  EXECUTE FUNCTION public.enqueue_profile_score_rebuild();

CREATE OR REPLACE FUNCTION public.claim_profile_score_rebuild_jobs(
  requested_limit integer DEFAULT 1
)
RETURNS TABLE (profile_id uuid, generation bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due_jobs AS (
    SELECT jobs.profile_id, jobs.generation
    FROM public.profile_score_rebuild_jobs AS jobs
    WHERE (
      jobs.status = 'pending'
      AND jobs.scheduled_at <= now()
    )
    OR (
      jobs.status = 'running'
      AND jobs.locked_at < now() - interval '10 minutes'
    )
    ORDER BY jobs.scheduled_at, jobs.profile_id
    LIMIT GREATEST(requested_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.profile_score_rebuild_jobs AS jobs
  SET
    status = 'running',
    attempts = jobs.attempts + 1,
    locked_at = now(),
    updated_at = now()
  FROM due_jobs
  WHERE jobs.profile_id = due_jobs.profile_id
  RETURNING jobs.profile_id, jobs.generation;
END;
$$;

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
      computed_at
    )
    SELECT
      job_profile_id,
      score_row.film_id,
      score_row.emotional_score,
      score_row.material_score,
      score_row.computed_at
    FROM jsonb_to_recordset(score_rows) AS score_row(
      film_id uuid,
      emotional_score numeric,
      material_score numeric,
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

CREATE OR REPLACE FUNCTION public.fail_profile_score_rebuild_job(
  job_profile_id uuid,
  job_generation bigint,
  error_message text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profile_score_rebuild_jobs
  SET
    status = 'pending',
    scheduled_at = now() + interval '60 seconds',
    locked_at = NULL,
    last_error = left(error_message, 2000),
    updated_at = now()
  WHERE profile_id = job_profile_id
    AND generation = job_generation
    AND status = 'running';
$$;

-- Kept for compatibility with an already deployed pre-atomic worker.
CREATE OR REPLACE FUNCTION public.complete_profile_score_rebuild_job(
  job_profile_id uuid,
  job_generation bigint
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profile_score_rebuild_jobs
  SET
    status = 'completed',
    locked_at = NULL,
    last_error = NULL,
    updated_at = now()
  WHERE profile_id = job_profile_id
    AND generation = job_generation
    AND status = 'running';
$$;

REVOKE ALL ON FUNCTION public.enqueue_profile_score_rebuild() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_profile_score_rebuild_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_profile_film_scores_if_current(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_profile_score_rebuild_job(uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_profile_score_rebuild_job(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_profile_score_rebuild_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_profile_film_scores_if_current(uuid, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_profile_score_rebuild_job(uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_profile_score_rebuild_job(uuid, bigint, text) TO service_role;
