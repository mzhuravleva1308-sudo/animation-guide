-- Soft-hide films from the public catalog without deleting rows or related data.
-- Existing rows stay visible via DEFAULT true.

ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS catalog_visible boolean NOT NULL DEFAULT true;
