export const FILM_FESTIVAL_RECOGNITION_TYPES = [
  "official_selection",
  "screening",
  "award",
  "nomination",
] as const;

export type FilmFestivalRecognitionType =
  (typeof FILM_FESTIVAL_RECOGNITION_TYPES)[number];

export const FILM_FESTIVAL_AWARD_RESULTS = [
  "winner",
  "nominee",
  "jury_prize",
  "grand_prize",
  "mention",
] as const;

export type FilmFestivalAwardResult =
  (typeof FILM_FESTIVAL_AWARD_RESULTS)[number];

/** @deprecated Prefer award_result */
export const FILM_FESTIVAL_AWARD_LEVELS = [
  "grand_prize",
  "jury_prize",
  "category_award",
  "mention",
] as const;

export type FilmFestivalAwardLevel =
  (typeof FILM_FESTIVAL_AWARD_LEVELS)[number];

export const FILM_FESTIVAL_CONFIDENCE_STATUSES = [
  "confirmed_official",
  "catalog_claim_unverified",
  "wikipedia_discovery_unverified",
  "incomplete_candidate",
] as const;

export type FilmFestivalConfidenceStatus =
  (typeof FILM_FESTIVAL_CONFIDENCE_STATUSES)[number];

export type FilmFestivalRecognitionInput = {
  festival_name: string;
  festival_year?: number | null;
  section?: string | null;
  recognition_type: FilmFestivalRecognitionType;
  award_name?: string | null;
  award_result?: FilmFestivalAwardResult | null;
  /** @deprecated Prefer award_result */
  award_level?: FilmFestivalAwardLevel | null;
  source_url?: string | null;
  source_label?: string | null;
  source_type?: string | null;
  original_text?: string | null;
  import_source?: string | null;
  import_key?: string | null;
};

export type FilmFestivalRecognition = FilmFestivalRecognitionInput & {
  id: string;
  film_id: string;
  canonical_festival_id: string | null;
  canonical_festival_name: string | null;
  source_display_name: string | null;
  normalized_festival_name: string;
  normalized_award_name: string | null;
  confidence_status: FilmFestivalConfidenceStatus | null;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
};

export type FilmFestivalRecognitionImportEntry = {
  film_id?: string;
  film_match?: {
    title: string;
    year?: number | null;
    original_title?: string | null;
  };
  import_source?: string | null;
  recognitions: FilmFestivalRecognitionInput[];
};
