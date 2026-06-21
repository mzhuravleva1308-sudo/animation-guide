-- Discovery layer: unverified festival participation claims, separate from confirmed recognitions.

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
