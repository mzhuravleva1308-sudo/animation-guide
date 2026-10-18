-- Per-axis rating detail (visual / mood / plot) for hypothesis testing.
-- Optional companion to film_ratings; only used by allowlisted accounts in UI.

CREATE TABLE IF NOT EXISTS public.film_rating_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES public.films (id) ON DELETE CASCADE,
  visual_rating integer NOT NULL,
  mood_rating integer NOT NULL,
  plot_rating integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, profile_id),
  CONSTRAINT film_rating_details_visual_rating_check
    CHECK (visual_rating >= 1 AND visual_rating <= 10),
  CONSTRAINT film_rating_details_mood_rating_check
    CHECK (mood_rating >= 1 AND mood_rating <= 10),
  CONSTRAINT film_rating_details_plot_rating_check
    CHECK (plot_rating >= 1 AND plot_rating <= 10)
);

CREATE INDEX IF NOT EXISTS film_rating_details_profile_id_idx
  ON public.film_rating_details (profile_id);

ALTER TABLE public.film_rating_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.film_rating_details FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.film_rating_details TO authenticated;
GRANT ALL ON TABLE public.film_rating_details TO service_role;

DROP POLICY IF EXISTS film_rating_details_select_own ON public.film_rating_details;
CREATE POLICY film_rating_details_select_own
  ON public.film_rating_details
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_rating_details.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS film_rating_details_insert_own ON public.film_rating_details;
CREATE POLICY film_rating_details_insert_own
  ON public.film_rating_details
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_rating_details.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS film_rating_details_update_own ON public.film_rating_details;
CREATE POLICY film_rating_details_update_own
  ON public.film_rating_details
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_rating_details.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_rating_details.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS film_rating_details_delete_own ON public.film_rating_details;
CREATE POLICY film_rating_details_delete_own
  ON public.film_rating_details
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = film_rating_details.profile_id
        AND p.user_id = (SELECT auth.uid())
    )
  );
