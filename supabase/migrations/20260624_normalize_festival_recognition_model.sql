-- Normalize festival recognition model: canonical festival identity,
-- confidence status, award_result, and recognition_type vocabulary.

ALTER TABLE public.film_festival_recognitions
  ADD COLUMN IF NOT EXISTS canonical_festival_id text,
  ADD COLUMN IF NOT EXISTS canonical_festival_name text,
  ADD COLUMN IF NOT EXISTS source_display_name text,
  ADD COLUMN IF NOT EXISTS confidence_status text,
  ADD COLUMN IF NOT EXISTS award_result text;

ALTER TABLE public.film_festival_recognitions
  DROP CONSTRAINT IF EXISTS film_festival_recognitions_recognition_type_check;

ALTER TABLE public.film_festival_recognitions
  ADD CONSTRAINT film_festival_recognitions_recognition_type_check
  CHECK (
    recognition_type IN (
      'official_selection',
      'screening',
      'award',
      'nomination',
      -- legacy values kept until data normalization script runs
      'winner',
      'nominee',
      'special_mention'
    )
  );

ALTER TABLE public.film_festival_recognitions
  DROP CONSTRAINT IF EXISTS film_festival_recognitions_award_level_check;

ALTER TABLE public.film_festival_recognitions
  ADD CONSTRAINT film_festival_recognitions_award_result_check
  CHECK (
    award_result IS NULL
    OR award_result IN (
      'winner',
      'nominee',
      'jury_prize',
      'grand_prize',
      'mention'
    )
  );

ALTER TABLE public.film_festival_recognitions
  ADD CONSTRAINT film_festival_recognitions_confidence_status_check
  CHECK (
    confidence_status IS NULL
    OR confidence_status IN (
      'confirmed_official',
      'catalog_claim_unverified',
      'wikipedia_discovery_unverified',
      'incomplete_candidate'
    )
  );

CREATE INDEX IF NOT EXISTS film_festival_recognitions_canonical_festival_id_idx
  ON public.film_festival_recognitions (canonical_festival_id)
  WHERE canonical_festival_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS film_festival_recognitions_confidence_status_idx
  ON public.film_festival_recognitions (confidence_status)
  WHERE confidence_status IS NOT NULL;
