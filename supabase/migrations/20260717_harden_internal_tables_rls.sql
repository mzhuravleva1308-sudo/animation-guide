-- Restrict internal computation, submission, and activity tables to service_role.
-- This migration changes access controls only; it does not change data or schema.

ALTER TABLE IF EXISTS public.aesthetic_tag_embeddings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.film_submissions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.mood_distances
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.mood_embeddings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.profile_activity_logs
  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'aesthetic_tag_embeddings',
    'film_submissions',
    'mood_distances',
    'mood_embeddings',
    'profile_activity_logs'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.%I FROM anon, authenticated',
        table_name
      );
    END IF;
  END LOOP;
END
$$;
