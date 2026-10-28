-- Review attention flags on discovery staging (e.g. primarily_for_children).
-- Does not change review_status; admin UI routes flagged rows to careful look.

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS review_flags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.film_discovery_candidates.review_flags IS
  'Attention tags for admin review (e.g. primarily_for_children). Not public catalog.';

CREATE INDEX IF NOT EXISTS film_discovery_candidates_review_flags_gin_idx
  ON public.film_discovery_candidates
  USING gin (review_flags);
