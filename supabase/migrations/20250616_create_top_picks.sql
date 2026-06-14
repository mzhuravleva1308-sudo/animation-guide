-- AI-generated personalized film recommendations per profile

CREATE TABLE top_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('safe_choice', 'taste_hit', 'risky_discovery')),
  rank integer NOT NULL CHECK (rank >= 1),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, category, rank),
  UNIQUE (profile_id, film_id)
);

CREATE INDEX top_picks_profile_id_category_rank_idx
  ON top_picks (profile_id, category, rank);

ALTER TABLE top_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "top_picks_select_all"
  ON top_picks
  FOR SELECT
  USING (true);

CREATE POLICY "top_picks_service_all"
  ON top_picks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
