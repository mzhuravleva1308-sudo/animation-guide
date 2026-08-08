-- Manual catalog quick-filter tokens for discovery staging.
-- Mirrors films.quick_filters (sci-fi | connection | distance).
-- Derived chips (stop-motion from technique, recent from year) are not stored.

ALTER TABLE public.film_discovery_candidates
  ADD COLUMN IF NOT EXISTS quick_filters text[];
