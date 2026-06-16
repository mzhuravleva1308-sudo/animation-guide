-- Cached poster URLs and original external image sources for films

ALTER TABLE films
  ADD COLUMN IF NOT EXISTS poster_url text,
  ADD COLUMN IF NOT EXISTS external_image_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('film-posters', 'film-posters', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

CREATE POLICY "film_posters_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'film-posters');
