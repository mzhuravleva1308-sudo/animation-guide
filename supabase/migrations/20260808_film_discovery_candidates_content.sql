-- Content fields for film discovery staging candidates.
-- Product fields mirror films naming. Service fields stay minimal.
-- Detailed reviewer/research diagnostics belong in dry-run JSON / logs only.
-- Does NOT write to public.films or change review_status / media_status.

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS synopsis text,
  ADD COLUMN IF NOT EXISTS the_mood text,
  ADD COLUMN IF NOT EXISTS technique text,
  ADD COLUMN IF NOT EXISTS moods text[],
  ADD COLUMN IF NOT EXISTS content_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS content_note text,
  ADD COLUMN IF NOT EXISTS content_revision_count integer NOT NULL DEFAULT 0
    CHECK (content_revision_count >= 0 AND content_revision_count <= 1),
  ADD COLUMN IF NOT EXISTS content_updated_at timestamptz;

ALTER TABLE public.film_discovery_candidates
  DROP CONSTRAINT IF EXISTS film_discovery_candidates_content_status_check;

ALTER TABLE public.film_discovery_candidates
  ADD CONSTRAINT film_discovery_candidates_content_status_check
  CHECK (
    content_status IN (
      'pending',
      'ready',
      'ready_with_note',
      'failed'
    )
  );

CREATE INDEX IF NOT EXISTS film_discovery_candidates_content_status_idx
  ON public.film_discovery_candidates (content_status, updated_at DESC);
