-- Live-action card header: material fact ("Object. Place.") replaces technique pills.
-- Animation keeps films.technique. Scoring axes (VW/ST) unchanged.

ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS material_fact text;

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS material_fact text;

COMMENT ON COLUMN public.films.material_fact IS
  'Live-action card pill: simple material fact as "Object. Place." (e.g. Public toilets. Tokyo).';

COMMENT ON COLUMN public.film_discovery_candidates.material_fact IS
  'Staging copy of films.material_fact for live-action discovery releases.';
