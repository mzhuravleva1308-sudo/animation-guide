-- Where-to-watch summary from TMDB/JustWatch: provider + regions for VPN UX.
-- Shape: {
--   "source": "tmdb",
--   "checked_at": ISO8601,
--   "tmdb_id": number | null,
--   "offers": [{ "provider": string, "type": "flatrate"|"rent"|"buy"|"free"|"ads", "regions": string[] }]
-- }

ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS watch_availability jsonb;

COMMENT ON COLUMN public.films.watch_availability IS
  'TMDB/JustWatch where-to-watch summary: curated providers with ISO region codes.';
