-- Allow vibe archive list type (was blocked by list_type check).
ALTER TABLE public.profile_film_lists
  DROP CONSTRAINT IF EXISTS profile_film_lists_list_type_check;

ALTER TABLE public.profile_film_lists
  ADD CONSTRAINT profile_film_lists_list_type_check
  CHECK (list_type = ANY (ARRAY['to_watch'::text, 'watched'::text, 'vibe_hidden'::text]));
