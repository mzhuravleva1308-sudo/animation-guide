-- One-shot bootstrap for hosted Supabase SQL Editor.
-- Run this entire file when film_festival_recognitions does not exist yet.
-- Order: recognitions (20260621–24) → claims (20260625) → FK (20260626).

-- === 20260621: film_festival_recognitions ===

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

DROP POLICY IF EXISTS "film_festival_recognitions_select_all"
  ON public.film_festival_recognitions;
CREATE POLICY "film_festival_recognitions_select_all"
  ON public.film_festival_recognitions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "film_festival_recognitions_service_all"
  ON public.film_festival_recognitions;
CREATE POLICY "film_festival_recognitions_service_all"
  ON public.film_festival_recognitions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- === 20260622: source metadata ===

ALTER TABLE public.film_festival_recognitions
  ADD COLUMN IF NOT EXISTS source_label text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS original_text text;

-- === 20260623: drop import_key unique (if present) ===

DROP INDEX IF EXISTS public.film_festival_recognitions_import_key_unique;

-- === 20260624: canonical + confidence model ===

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
  DROP CONSTRAINT IF EXISTS film_festival_recognitions_confidence_status_check;

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

-- === 20260625: film_festival_claims ===

CREATE TABLE IF NOT EXISTS public.film_festival_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  film_id uuid NOT NULL REFERENCES public.films (id) ON DELETE CASCADE,
  raw_festival_name text NOT NULL,
  canonical_festival_id text,
  festival_year integer,
  section text,
  recognition_type text NOT NULL,
  award_name text,
  award_result text,
  source_type text NOT NULL,
  source_url text,
  original_text text,
  claim_status text NOT NULL,
  verification_reason text,
  official_url text,
  discovery_source text NOT NULL DEFAULT 'catalog_backfill_v1',
  dedupe_key text NOT NULL,
  recognition_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT film_festival_claims_festival_year_check
    CHECK (
      festival_year IS NULL
      OR (festival_year >= 1900 AND festival_year <= 2100)
    ),
  CONSTRAINT film_festival_claims_claim_status_check
    CHECK (
      claim_status IN (
        'discovered_unverified',
        'blocked_or_incomplete',
        'rejected_after_verification',
        'confirmed'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS film_festival_claims_dedupe_key_unique
  ON public.film_festival_claims (film_id, dedupe_key);

CREATE INDEX IF NOT EXISTS film_festival_claims_film_id_idx
  ON public.film_festival_claims (film_id);

CREATE INDEX IF NOT EXISTS film_festival_claims_canonical_festival_id_idx
  ON public.film_festival_claims (canonical_festival_id)
  WHERE canonical_festival_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS film_festival_claims_claim_status_idx
  ON public.film_festival_claims (claim_status);

CREATE OR REPLACE FUNCTION public.film_festival_claims_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS film_festival_claims_updated_at_trigger
  ON public.film_festival_claims;

CREATE TRIGGER film_festival_claims_updated_at_trigger
  BEFORE UPDATE ON public.film_festival_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.film_festival_claims_set_updated_at();

ALTER TABLE public.film_festival_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "film_festival_claims_select_all"
  ON public.film_festival_claims;
CREATE POLICY "film_festival_claims_select_all"
  ON public.film_festival_claims
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "film_festival_claims_service_all"
  ON public.film_festival_claims;
CREATE POLICY "film_festival_claims_service_all"
  ON public.film_festival_claims
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- === 20260626: claims → recognitions FK ===

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'film_festival_claims_recognition_id_fkey'
  ) THEN
    ALTER TABLE public.film_festival_claims
      ADD CONSTRAINT film_festival_claims_recognition_id_fkey
      FOREIGN KEY (recognition_id)
      REFERENCES public.film_festival_recognitions (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- === 20260627: API role grants ===

GRANT SELECT ON public.film_festival_recognitions TO anon, authenticated;
GRANT SELECT ON public.film_festival_claims TO anon, authenticated;
GRANT ALL ON public.film_festival_recognitions TO service_role;
GRANT ALL ON public.film_festival_claims TO service_role;
