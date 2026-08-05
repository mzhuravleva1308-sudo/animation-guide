-- Media fields for film discovery staging candidates.
-- External poster/trailer URLs only (same provenance style as films.image_url /
-- films.trailer_*). Does NOT write to public.films or Storage bucket film-posters.

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS poster_source_url text,
  ADD COLUMN IF NOT EXISTS poster_source_label text,
  ADD COLUMN IF NOT EXISTS trailer_url text,
  ADD COLUMN IF NOT EXISTS trailer_provider text,
  ADD COLUMN IF NOT EXISTS trailer_video_id text,
  ADD COLUMN IF NOT EXISTS trailer_source text,
  ADD COLUMN IF NOT EXISTS trailer_source_label text,
  ADD COLUMN IF NOT EXISTS media_status text NOT NULL DEFAULT 'media_pending',
  ADD COLUMN IF NOT EXISTS media_notes text,
  ADD COLUMN IF NOT EXISTS media_attempts integer NOT NULL DEFAULT 0
    CHECK (media_attempts >= 0),
  ADD COLUMN IF NOT EXISTS media_updated_at timestamptz;

ALTER TABLE public.film_discovery_candidates
  DROP CONSTRAINT IF EXISTS film_discovery_candidates_media_status_check;

ALTER TABLE public.film_discovery_candidates
  ADD CONSTRAINT film_discovery_candidates_media_status_check
  CHECK (
    media_status IN (
      'media_pending',
      'media_complete',
      'media_partial',
      'media_failed',
      'media_needs_review'
    )
  );

ALTER TABLE public.film_discovery_candidates
  DROP CONSTRAINT IF EXISTS film_discovery_candidates_trailer_source_check;

ALTER TABLE public.film_discovery_candidates
  ADD CONSTRAINT film_discovery_candidates_trailer_source_check
  CHECK (
    trailer_source IS NULL
    OR trailer_source IN ('manual', 'auto')
  );

CREATE INDEX IF NOT EXISTS film_discovery_candidates_media_status_idx
  ON public.film_discovery_candidates (media_status, updated_at DESC);
