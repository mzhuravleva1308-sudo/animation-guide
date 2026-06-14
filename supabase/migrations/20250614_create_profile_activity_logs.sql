-- Activity logs for profile page interactions

CREATE TABLE profile_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  film_id uuid REFERENCES films(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profile_activity_logs_profile_id_created_at_idx
  ON profile_activity_logs (profile_id, created_at DESC);

CREATE INDEX profile_activity_logs_event_type_created_at_idx
  ON profile_activity_logs (event_type, created_at DESC);

CREATE INDEX profile_activity_logs_film_id_created_at_idx
  ON profile_activity_logs (film_id, created_at DESC)
  WHERE film_id IS NOT NULL;

ALTER TABLE profile_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_activity_logs_service_all"
  ON profile_activity_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
