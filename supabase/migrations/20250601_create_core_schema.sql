-- Base tables for fresh local Supabase and environments without prior manual schema.
-- Hosted production predates tracked migrations; IF NOT EXISTS keeps db push safe there.

CREATE TABLE IF NOT EXISTS public.films (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  original_title text,
  director text,
  year integer,
  country text,
  duration_minutes integer,
  festival text,
  section text,
  source_url text,
  watch_url text,
  image_url text,
  trailer_url text,
  availability text,
  synopsis text,
  technique text,
  moods text[],
  aesthetic_tags text[],
  narrative_tags text[],
  themes text[],
  dialogue text,
  emotional_intensity integer,
  weirdness integer,
  kid_safety text,
  why_i_might_like_it text,
  what_it_is text,
  the_mood text,
  personal_note text,
  status text,
  cold_start_score numeric,
  cold_start_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  slug text NOT NULL,
  share_token text NOT NULL,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  taste_profile text,
  taste_profile_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_unique_idx ON public.profiles (slug);

CREATE INDEX IF NOT EXISTS profiles_user_id_idx
  ON public.profiles (user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.film_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES public.films (id) ON DELETE CASCADE,
  rating integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (film_id, profile_id)
);

CREATE INDEX IF NOT EXISTS film_ratings_profile_id_idx
  ON public.film_ratings (profile_id);

CREATE TABLE IF NOT EXISTS public.profile_film_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES public.films (id) ON DELETE CASCADE,
  list_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_film_lists_profile_list_type_idx
  ON public.profile_film_lists (profile_id, list_type);

CREATE TABLE IF NOT EXISTS public.profile_taste_cores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  core_type text NOT NULL,
  core_index integer NOT NULL,
  name text,
  description text,
  strength numeric,
  coverage numeric,
  maturity text,
  average_rating numeric,
  film_ids uuid[],
  film_titles text[],
  nearest_moods text[],
  center_embedding jsonb,
  emotional_profile_tags text[],
  aesthetic_profile_tags text[],
  name_generated_at timestamptz,
  updated_at timestamptz,
  UNIQUE (profile_id, core_type, core_index)
);

CREATE TABLE IF NOT EXISTS public.profile_film_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  film_id uuid NOT NULL REFERENCES public.films (id) ON DELETE CASCADE,
  emotional_score numeric,
  material_score numeric,
  computed_at timestamptz,
  UNIQUE (profile_id, film_id)
);

CREATE TABLE IF NOT EXISTS public.mood_embeddings (
  mood text PRIMARY KEY,
  embedding jsonb NOT NULL,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.film_mood_embeddings (
  film_id uuid PRIMARY KEY REFERENCES public.films (id) ON DELETE CASCADE,
  mood_text text,
  embedding jsonb NOT NULL,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.film_aesthetic_embeddings (
  film_id uuid PRIMARY KEY REFERENCES public.films (id) ON DELETE CASCADE,
  aesthetic_text text,
  embedding jsonb NOT NULL,
  updated_at timestamptz
);
