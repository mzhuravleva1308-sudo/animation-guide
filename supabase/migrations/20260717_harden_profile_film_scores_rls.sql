-- Keep profile film scores server-side.
-- The profile page reads them through the server-only service-role client.
-- This migration changes access controls only; it does not change data or schema.

ALTER TABLE IF EXISTS public.profile_film_scores
  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.profile_film_scores') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.profile_film_scores FROM anon, authenticated;
  END IF;
END
$$;
