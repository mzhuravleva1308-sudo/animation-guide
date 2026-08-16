-- Festival award recognitions for discovery staging candidates.
-- Staging mirror of film_festival_recognitions (AI winners shape).
-- Does NOT write to public.films or film_festival_recognitions.

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS festival_recognitions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.film_discovery_candidates.festival_recognitions IS
  'Staging AI/manual festival award wins (jsonb array). Promote to film_festival_recognitions on publish.';
