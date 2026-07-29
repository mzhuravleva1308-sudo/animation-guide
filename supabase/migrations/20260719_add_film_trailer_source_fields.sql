-- Persist trailer source identity alongside the canonical watch URL.
-- Thumbnails must never be written into poster/image fields by trailer scripts.

ALTER TABLE public.films
  ADD COLUMN IF NOT EXISTS trailer_provider text,
  ADD COLUMN IF NOT EXISTS trailer_video_id text;
