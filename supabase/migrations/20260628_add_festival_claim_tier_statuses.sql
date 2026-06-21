-- Three-tier festival claim statuses: possibly → confirmed presence → enriched.

ALTER TABLE public.film_festival_claims
  DROP CONSTRAINT IF EXISTS film_festival_claims_claim_status_check;

ALTER TABLE public.film_festival_claims
  ADD CONSTRAINT film_festival_claims_claim_status_check
  CHECK (
    claim_status IN (
      'possibly_at_festival',
      'confirmed_presence',
      'enriched',
      'not_at_festival',
      'discovered_unverified',
      'blocked_or_incomplete',
      'rejected_after_verification',
      'confirmed'
    )
  );
