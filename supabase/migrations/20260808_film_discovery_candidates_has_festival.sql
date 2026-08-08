-- Festival participation yes/no for discovery staging (Festival filter signal).
-- Distinct from festival_recognitions (award wins → Award winners chip).
-- Does NOT write to public.films or film_festival_claims.

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS has_festival boolean,
  ADD COLUMN IF NOT EXISTS festival_claims jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.film_discovery_candidates.has_festival IS
  'Staging Festival filter flag: true if film plausibly participated at a festival (selection/premiere), false if assessed with none, null if not yet assessed. Promote via film_festival_claims on publish.';

COMMENT ON COLUMN public.film_discovery_candidates.festival_claims IS
  'Staging AI/manual festival participation claims (jsonb array). Evidence for has_festival; promote to film_festival_claims on publish.';
