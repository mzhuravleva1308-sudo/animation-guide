-- Optional note on profile list rows (used by vibe_hidden “why it didn’t fit”).
ALTER TABLE public.profile_film_lists
  ADD COLUMN IF NOT EXISTS note text;
