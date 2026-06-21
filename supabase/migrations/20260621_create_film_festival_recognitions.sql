-- Structured festival history for films (one film may have many recognitions).
-- Legacy films.festival / films.section remain for backward compatibility.

CREATE TABLE IF NOT EXISTS public.film_festival_recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES public.films (id) ON DELETE CASCADE,
  festival_name text NOT NULL,
  normalized_festival_name text NOT NULL,
  festival_year integer,
  section text,
  recognition_type text NOT NULL,
  award_name text,
  normalized_award_name text,
  award_level text,
  source_url text,
  source_label text,
  source_type text,
  original_text text,
  import_source text,
  import_key text,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT film_festival_recognitions_festival_year_check
    CHECK (
      festival_year IS NULL
      OR (festival_year >= 1900 AND festival_year <= 2100)
    ),
  CONSTRAINT film_festival_recognitions_recognition_type_check
    CHECK (
      recognition_type IN (
        'winner',
        'award',
        'nominee',
        'official_selection',
        'special_mention',
        'screening'
      )
    ),
  CONSTRAINT film_festival_recognitions_award_level_check
    CHECK (
      award_level IS NULL
      OR award_level IN (
        'grand_prize',
        'jury_prize',
        'category_award',
        'mention'
      )
    )
);

CREATE INDEX IF NOT EXISTS film_festival_recognitions_film_id_idx
  ON public.film_festival_recognitions (film_id);

CREATE INDEX IF NOT EXISTS film_festival_recognitions_festival_year_idx
  ON public.film_festival_recognitions (festival_year)
  WHERE festival_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS film_festival_recognitions_recognition_type_idx
  ON public.film_festival_recognitions (recognition_type);

CREATE INDEX IF NOT EXISTS film_festival_recognitions_award_level_idx
  ON public.film_festival_recognitions (award_level)
  WHERE award_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS film_festival_recognitions_normalized_festival_name_idx
  ON public.film_festival_recognitions (normalized_festival_name);

CREATE UNIQUE INDEX IF NOT EXISTS film_festival_recognitions_dedupe_key_unique
  ON public.film_festival_recognitions (film_id, dedupe_key);

CREATE OR REPLACE FUNCTION public.film_festival_recognitions_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS film_festival_recognitions_updated_at_trigger
  ON public.film_festival_recognitions;

CREATE TRIGGER film_festival_recognitions_updated_at_trigger
  BEFORE UPDATE ON public.film_festival_recognitions
  FOR EACH ROW
  EXECUTE FUNCTION public.film_festival_recognitions_set_updated_at();

ALTER TABLE public.film_festival_recognitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "film_festival_recognitions_select_all"
  ON public.film_festival_recognitions
  FOR SELECT
  USING (true);

CREATE POLICY "film_festival_recognitions_service_all"
  ON public.film_festival_recognitions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
