-- One animation guide profile per Supabase Auth user.
-- profiles.user_id already exists on hosted DB; this prevents accidental double-linking.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique_idx
  ON public.profiles (user_id)
  WHERE user_id IS NOT NULL;
