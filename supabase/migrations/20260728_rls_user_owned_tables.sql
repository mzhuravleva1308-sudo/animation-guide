-- P0-1: Enable RLS on user-owned tables and revoke unsafe anon/authenticated grants.
-- Public catalog (films) and share-link reads via service-role server code are unchanged.
-- This migration changes access controls only; it does not change table structure.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- film_ratings
-- ---------------------------------------------------------------------------
ALTER TABLE public.film_ratings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.film_ratings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.film_ratings TO authenticated;
GRANT ALL ON TABLE public.film_ratings TO service_role;

DROP POLICY IF EXISTS film_ratings_select_own ON public.film_ratings;
CREATE POLICY film_ratings_select_own
  ON public.film_ratings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_ratings.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS film_ratings_insert_own ON public.film_ratings;
CREATE POLICY film_ratings_insert_own
  ON public.film_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_ratings.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS film_ratings_update_own ON public.film_ratings;
CREATE POLICY film_ratings_update_own
  ON public.film_ratings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_ratings.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_ratings.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS film_ratings_delete_own ON public.film_ratings;
CREATE POLICY film_ratings_delete_own
  ON public.film_ratings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_ratings.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- profile_film_lists
-- ---------------------------------------------------------------------------
ALTER TABLE public.profile_film_lists ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_film_lists FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profile_film_lists TO authenticated;
GRANT ALL ON TABLE public.profile_film_lists TO service_role;

DROP POLICY IF EXISTS profile_film_lists_select_own ON public.profile_film_lists;
CREATE POLICY profile_film_lists_select_own
  ON public.profile_film_lists
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = profile_film_lists.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS profile_film_lists_insert_own ON public.profile_film_lists;
CREATE POLICY profile_film_lists_insert_own
  ON public.profile_film_lists
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = profile_film_lists.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS profile_film_lists_update_own ON public.profile_film_lists;
CREATE POLICY profile_film_lists_update_own
  ON public.profile_film_lists
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = profile_film_lists.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = profile_film_lists.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS profile_film_lists_delete_own ON public.profile_film_lists;
CREATE POLICY profile_film_lists_delete_own
  ON public.profile_film_lists
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = profile_film_lists.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- profile_taste_cores (read for owner; writes only via service_role)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profile_taste_cores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profile_taste_cores FROM anon, authenticated;
GRANT SELECT ON TABLE public.profile_taste_cores TO authenticated;
GRANT ALL ON TABLE public.profile_taste_cores TO service_role;

DROP POLICY IF EXISTS profile_taste_cores_select_own ON public.profile_taste_cores;
CREATE POLICY profile_taste_cores_select_own
  ON public.profile_taste_cores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = profile_taste_cores.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );
