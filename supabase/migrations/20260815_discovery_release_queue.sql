-- Discovery release tracking + import queue checklist / origin.

-- Candidates: release lifecycle after admin approve
ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS release_status text NOT NULL DEFAULT 'not_queued'
    CHECK (
      release_status IN (
        'not_queued',
        'queued',
        'blocked',
        'prepping',
        'ready_for_release',
        'released',
        'failed'
      )
    );

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS release_queue_id uuid
    REFERENCES public.film_import_queue (id) ON DELETE SET NULL;

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS release_blockers text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS film_id uuid
    REFERENCES public.films (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS film_discovery_candidates_release_status_idx
  ON public.film_discovery_candidates (release_status);

CREATE INDEX IF NOT EXISTS film_discovery_candidates_film_id_idx
  ON public.film_discovery_candidates (film_id)
  WHERE film_id IS NOT NULL;

-- Import queue: origin + checklist for discovery releases
ALTER TABLE public.film_import_queue
  ADD COLUMN IF NOT EXISTS origin text;

ALTER TABLE public.film_import_queue
  ADD COLUMN IF NOT EXISTS discovery_candidate_id uuid
    REFERENCES public.film_discovery_candidates (id) ON DELETE SET NULL;

ALTER TABLE public.film_import_queue
  ADD COLUMN IF NOT EXISTS result_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS film_import_queue_origin_idx
  ON public.film_import_queue (origin)
  WHERE origin IS NOT NULL;

CREATE INDEX IF NOT EXISTS film_import_queue_discovery_candidate_idx
  ON public.film_import_queue (discovery_candidate_id)
  WHERE discovery_candidate_id IS NOT NULL;

-- Batch Go Live audit
CREATE TABLE IF NOT EXISTS public.film_release_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_ids uuid[] NOT NULL DEFAULT '{}',
  candidate_ids uuid[] NOT NULL DEFAULT '{}',
  queue_ids uuid[] NOT NULL DEFAULT '{}',
  actor text,
  notes text,
  profile_scores_enqueued boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.film_release_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.film_release_batches FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.film_release_batches TO service_role;
