-- Allow animation three-axis ranking artifacts alongside legacy native (2-axis).
-- Rollback for viewers: stop reading native_3axis (allowlist/flag); rows can remain.

ALTER TABLE public.profile_film_scores
  DROP CONSTRAINT IF EXISTS profile_film_scores_score_mode_check;

ALTER TABLE public.profile_film_scores
  ADD CONSTRAINT profile_film_scores_score_mode_check
  CHECK (score_mode IN ('native', 'cross_media', 'native_3axis'));
