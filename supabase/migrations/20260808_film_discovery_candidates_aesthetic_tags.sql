-- Aesthetic / material feeling tags for discovery staging candidates.
-- Mirrors films.aesthetic_tags. Does NOT write to public.films.

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS aesthetic_tags text[];
