-- Weekly film import candidate queue.
-- Claimed by orchestration jobs with FOR UPDATE SKIP LOCKED (same pattern as profile_score_rebuild_jobs).

CREATE TABLE IF NOT EXISTS public.film_import_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order bigint NOT NULL DEFAULT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint,
  title text NOT NULL,
  year integer NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'processing',
        'completed',
        'completed_with_warnings',
        'failed'
      )
    ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  started_at timestamptz,
  finished_at timestamptz,
  locked_at timestamptz,
  result_status text,
  result_message text,
  film_id uuid REFERENCES public.films (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS film_import_queue_claim_idx
  ON public.film_import_queue (status, sort_order, created_at, id);

CREATE INDEX IF NOT EXISTS film_import_queue_pending_idx
  ON public.film_import_queue (sort_order, created_at)
  WHERE status = 'pending';

ALTER TABLE public.film_import_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.film_import_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.film_import_queue TO service_role;

CREATE OR REPLACE FUNCTION public.claim_film_import_queue_items(
  requested_limit integer DEFAULT 5,
  stale_after_minutes integer DEFAULT 90
)
RETURNS SETOF public.film_import_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT queue.id
    FROM public.film_import_queue AS queue
    WHERE (
      queue.status = 'pending'
      AND queue.attempts < queue.max_attempts
    )
    OR (
      queue.status = 'processing'
      AND queue.locked_at IS NOT NULL
      AND queue.locked_at < now() - make_interval(mins => GREATEST(stale_after_minutes, 1))
      AND queue.attempts < queue.max_attempts
    )
    ORDER BY queue.sort_order ASC, queue.created_at ASC, queue.id ASC
    LIMIT GREATEST(requested_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.film_import_queue AS queue
  SET
    status = 'processing',
    attempts = queue.attempts + 1,
    started_at = COALESCE(queue.started_at, now()),
    locked_at = now(),
    finished_at = NULL,
    result_status = NULL,
    result_message = NULL,
    updated_at = now()
  FROM due
  WHERE queue.id = due.id
  RETURNING queue.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_pending_film_import_queue_items()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.film_import_queue
  WHERE status = 'pending'
    AND attempts < max_attempts;
$$;

REVOKE ALL ON FUNCTION public.claim_film_import_queue_items(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_film_import_queue_items(integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.count_pending_film_import_queue_items()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_pending_film_import_queue_items()
  TO service_role;
