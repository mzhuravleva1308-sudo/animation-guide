import {
  buildBackfillImportKey,
  canonicalFestivalKey,
} from "./backfill-film-festival-recognitions.mjs";
import { resolveCanonicalFestival } from "./festival-canonical-identity.mjs";
import { EVIDENCE_STATUSES } from "./festival-evidence-quality.mjs";
import {
  normalizeAwardResult,
  normalizeOptionalText,
  normalizeRecognitionType,
} from "./film-festival-recognition.mjs";

export const CLAIM_STATUSES = {
  NOT_AT_FESTIVAL: "not_at_festival",
  POSSIBLY: "possibly_at_festival",
  CONFIRMED_PRESENCE: "confirmed_presence",
  ENRICHED: "enriched",
  DISCOVERED: "discovered_unverified",
  BLOCKED: "blocked_or_incomplete",
  REJECTED: "rejected_after_verification",
  CONFIRMED: "confirmed",
};

export const RECOGNITION_TYPE_POSSIBLE = "possible_participation";
export const DISCOVERY_SOURCE = "catalog_backfill_v1";

/**
 * @param {string} festivalId
 */
export function buildPossibleParticipationDedupeKey(festivalId) {
  return `${festivalId}|possible|`;
}

/**
 * Hosted DB may still use the original claim_status constraint until migration 20260628 runs.
 * @param {string} status
 */
export function toPersistedClaimStatus(status) {
  switch (status) {
    case CLAIM_STATUSES.POSSIBLY:
      return CLAIM_STATUSES.DISCOVERED;
    case CLAIM_STATUSES.CONFIRMED_PRESENCE:
    case CLAIM_STATUSES.ENRICHED:
      return CLAIM_STATUSES.CONFIRMED;
    case CLAIM_STATUSES.NOT_AT_FESTIVAL:
      return CLAIM_STATUSES.REJECTED;
    default:
      return status;
  }
}

/**
 * @param {string} persistedStatus
 */
export function displayClaimStatus(persistedStatus) {
  switch (persistedStatus) {
    case CLAIM_STATUSES.DISCOVERED:
      return CLAIM_STATUSES.POSSIBLY;
    case CLAIM_STATUSES.CONFIRMED:
      return CLAIM_STATUSES.CONFIRMED_PRESENCE;
    case CLAIM_STATUSES.REJECTED:
      return CLAIM_STATUSES.NOT_AT_FESTIVAL;
    default:
      return persistedStatus;
  }
}

/**
 * @typedef {import("../types/film-festival-claim").FilmFestivalClaimStatus} FilmFestivalClaimStatus
 * @typedef {import("./festival-evidence-quality.mjs").FestivalEvidenceCandidate} FestivalEvidenceCandidate
 */

/**
 * @param {FestivalEvidenceCandidate} candidate
 * @param {{ verified?: boolean, rejected?: boolean, presenceConfirmed?: boolean, enriched?: boolean }} [context]
 * @returns {FilmFestivalClaimStatus}
 */
export function resolveClaimStatus(candidate, context = {}) {
  if (context.enriched) {
    return CLAIM_STATUSES.ENRICHED;
  }

  if (
    context.presenceConfirmed ||
    context.verified ||
    candidate.evidence_status === EVIDENCE_STATUSES.CONFIRMED_OFFICIAL
  ) {
    return CLAIM_STATUSES.CONFIRMED_PRESENCE;
  }

  if (context.rejected) {
    return CLAIM_STATUSES.REJECTED;
  }

  if (
    candidate.evidence_status === EVIDENCE_STATUSES.SKIPPED ||
    candidate.evidence_status === EVIDENCE_STATUSES.SKIPPED_OUT_OF_SCOPE
  ) {
    return CLAIM_STATUSES.BLOCKED;
  }

  if (candidate.recognition_type === RECOGNITION_TYPE_POSSIBLE) {
    return CLAIM_STATUSES.POSSIBLY;
  }

  return CLAIM_STATUSES.DISCOVERED;
}

/**
 * @param {FestivalEvidenceCandidate} candidate
 * @param {string} filmId
 * @param {{ verified?: boolean, rejected?: boolean, presenceConfirmed?: boolean, enriched?: boolean, officialUrl?: string | null, verificationReason?: string | null, festivalId?: string | null }} [context]
 */
export function candidateToClaimRow(candidate, filmId, context = {}) {
  const canonical = resolveCanonicalFestival(candidate.festival_name);
  const festivalId =
    context.festivalId ??
    canonical.id ??
    (canonicalFestivalKey(candidate.festival_name) || null);
  const isPossibleParticipation =
    candidate.recognition_type === RECOGNITION_TYPE_POSSIBLE;
  const recognitionType = isPossibleParticipation
    ? RECOGNITION_TYPE_POSSIBLE
    : (normalizeRecognitionType(candidate.recognition_type) ??
      candidate.recognition_type);
  const awardResult = normalizeAwardResult(
    candidate.award_result ?? candidate.award_level ?? null
  );
  const dedupeKey = isPossibleParticipation
    ? buildPossibleParticipationDedupeKey(String(festivalId ?? "unknown"))
    : buildBackfillImportKey({
        festival_name: candidate.festival_name,
        festival_year: candidate.festival_year ?? null,
        recognition_type: candidate.recognition_type,
        award_name: candidate.award_name ?? null,
        section: candidate.section ?? null,
      });

  return {
    film_id: filmId,
    raw_festival_name: candidate.festival_name,
    canonical_festival_id: festivalId,
    festival_year: candidate.festival_year ?? null,
    section: candidate.section ?? null,
    recognition_type: recognitionType,
    award_name: candidate.award_name ?? null,
    award_result: awardResult,
    source_type: candidate.source_type ?? "unknown",
    source_url: candidate.source_url ?? null,
    original_text: candidate.original_text ?? null,
    claim_status: resolveClaimStatus(candidate, context),
    verification_reason:
      context.verificationReason ??
      candidate.acceptance_reason ??
      null,
    official_url: context.officialUrl ?? null,
    discovery_source: candidate.discovery_source ?? DISCOVERY_SOURCE,
    dedupe_key: dedupeKey,
    recognition_id: null,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} filmId
 * @param {ReturnType<typeof candidateToClaimRow>[]} claims
 */
export async function upsertFilmFestivalClaims(supabase, filmId, claims) {
  /** @type {Record<string, unknown>[]} */
  const upserted = [];

  for (const claim of claims) {
    const row = { ...claim, film_id: filmId };

    const { data: existing, error: lookupError } = await supabase
      .from("film_festival_claims")
      .select("id, claim_status, recognition_id")
      .eq("film_id", filmId)
      .eq("dedupe_key", row.dedupe_key)
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    if (existing?.id) {
      const preserveRecognitionId =
        existing.recognition_id && row.claim_status !== CLAIM_STATUSES.CONFIRMED
          ? existing.recognition_id
          : row.recognition_id ?? existing.recognition_id;

      const { data, error } = await supabase
        .from("film_festival_claims")
        .update({
          ...row,
          recognition_id: preserveRecognitionId,
        })
        .eq("id", existing.id)
        .select("*");

      if (error) {
        throw error;
      }

      upserted.push(...(data ?? []));
      continue;
    }

    const { data, error } = await supabase
      .from("film_festival_claims")
      .insert(row)
      .select("*");

    if (error) {
      throw error;
    }

    upserted.push(...(data ?? []));
  }

  return upserted;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ canonicalFestivalId?: string, claimStatuses?: string[], limit?: number, offset?: number }} [options]
 */
export async function loadFilmFestivalClaimsForVerification(
  supabase,
  options = {}
) {
  const {
    canonicalFestivalId = "annecy",
    claimStatuses = [
      CLAIM_STATUSES.POSSIBLY,
      CLAIM_STATUSES.DISCOVERED,
    ],
  } = options;

  let query = supabase
    .from("film_festival_claims")
    .select("*")
    .eq("canonical_festival_id", canonicalFestivalId)
    .in("claim_status", claimStatuses)
    .order("created_at", { ascending: true });

  if (options.limit != null) {
    query = query.range(
      options.offset ?? 0,
      (options.offset ?? 0) + options.limit - 1
    );
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * @param {Record<string, unknown>} claim
 * @returns {FestivalEvidenceCandidate}
 */
export function claimRowToCandidate(claim, filmTitle) {
  return {
    festival_name: String(claim.raw_festival_name),
    festival_year: claim.festival_year ?? null,
    section: normalizeOptionalText(claim.section),
    recognition_type: String(claim.recognition_type),
    award_name: normalizeOptionalText(claim.award_name),
    award_level: null,
    award_result: claim.award_result ?? null,
    source_url: normalizeOptionalText(claim.source_url),
    source_label: null,
    source_type: String(claim.source_type),
    original_text: normalizeOptionalText(claim.original_text),
    evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW,
    acceptance_reason:
      normalizeOptionalText(claim.verification_reason) ??
      "Loaded from persisted festival claim pending official verification.",
    importable: false,
    film_title: filmTitle,
  };
}

/**
 * @param {Record<string, unknown>[]} claims
 */
export function summarizeClaimStatuses(claims) {
  return claims.reduce(
    (summary, claim) => {
      const status = String(claim.claim_status);
      summary[status] = (summary[status] ?? 0) + 1;
      return summary;
    },
    /** @type {Record<string, number>} */ ({})
  );
}
