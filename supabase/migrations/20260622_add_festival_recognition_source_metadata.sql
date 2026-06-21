-- Add source metadata columns for backfill and enrichment provenance.
-- Safe on environments that already applied 20250621 without these fields.

ALTER TABLE public.film_festival_recognitions
  ADD COLUMN IF NOT EXISTS source_label text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS original_text text;
