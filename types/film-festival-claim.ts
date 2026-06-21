export const FILM_FESTIVAL_CLAIM_STATUSES = [
  "possibly_at_festival",
  "confirmed_presence",
  "enriched",
  "not_at_festival",
  "discovered_unverified",
  "blocked_or_incomplete",
  "rejected_after_verification",
  "confirmed",
] as const;

export type FilmFestivalClaimStatus =
  (typeof FILM_FESTIVAL_CLAIM_STATUSES)[number];

export type FilmFestivalClaimInput = {
  raw_festival_name: string;
  canonical_festival_id?: string | null;
  festival_year?: number | null;
  section?: string | null;
  recognition_type: string;
  award_name?: string | null;
  award_result?: string | null;
  source_type: string;
  source_url?: string | null;
  original_text?: string | null;
  claim_status: FilmFestivalClaimStatus;
  verification_reason?: string | null;
  official_url?: string | null;
  discovery_source?: string | null;
  dedupe_key: string;
  recognition_id?: string | null;
};

export type FilmFestivalClaim = FilmFestivalClaimInput & {
  id: string;
  film_id: string;
  created_at: string;
  updated_at: string;
};
