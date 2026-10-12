/**
 * Copy festival_claims + festival_recognitions from a discovery candidate
 * onto the live catalog tables for a film.
 *
 * Discovery release previously dropped claims entirely and dropped
 * recognitions without source_url (import schema requires URL). This sync
 * is the preserve path after film insert / duplicate skip.
 */

import {
  CLAIM_STATUSES,
  RECOGNITION_TYPE_POSSIBLE,
  candidateToClaimRow,
  upsertFilmFestivalClaims,
} from "./film-festival-claim.mjs";
import { upsertFilmFestivalRecognitions } from "./film-festival-recognition.mjs";
import { filterClaimsToResonaleMajorFestivals } from "./resonale-major-festivals.mjs";

export const DISCOVERY_RELEASE_FESTIVAL_SOURCE = "discovery_release_v1";

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function nonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

/**
 * @param {unknown} claims
 * @param {string} filmId
 */
export function discoveryClaimsToCatalogRows(claims, filmId) {
  const major = filterClaimsToResonaleMajorFestivals(claims);
  return major.map((row) => {
    const recognitionType =
      nonEmptyString(row.recognition_type) ?? RECOGNITION_TYPE_POSSIBLE;
    const claim = candidateToClaimRow(
      {
        festival_name: row.festival_name,
        festival_year: row.festival_year ?? null,
        section: row.section ?? null,
        recognition_type: recognitionType,
        award_name: row.award_name ?? null,
        award_result: row.award_result ?? null,
        source_type: row.source_type ?? "discovery_staging",
        source_url: row.source_url ?? null,
        original_text: row.original_text ?? null,
        acceptance_reason: row.acceptance_reason ?? null,
        discovery_source:
          row.import_source ??
          row.discovery_source ??
          DISCOVERY_RELEASE_FESTIVAL_SOURCE,
      },
      filmId,
      {
        presenceConfirmed: recognitionType !== RECOGNITION_TYPE_POSSIBLE,
        verified: recognitionType !== RECOGNITION_TYPE_POSSIBLE,
      }
    );
    // Prefer confirmed for official_selection-style staging rows.
    if (
      recognitionType !== RECOGNITION_TYPE_POSSIBLE &&
      claim.claim_status !== CLAIM_STATUSES.CONFIRMED &&
      claim.claim_status !== CLAIM_STATUSES.CONFIRMED_PRESENCE
    ) {
      claim.claim_status = CLAIM_STATUSES.CONFIRMED_PRESENCE;
    }
    return claim;
  });
}

/**
 * @param {unknown} recognitions
 */
export function discoveryRecognitionsToCatalogInputs(recognitions) {
  if (!Array.isArray(recognitions)) return [];
  /** @type {object[]} */
  const out = [];
  for (const row of recognitions) {
    if (!row || typeof row !== "object") continue;
    const festival_name = nonEmptyString(row.festival_name);
    const festival_year = Number(row.festival_year);
    if (!festival_name || !Number.isInteger(festival_year)) continue;

    const recognition_type =
      nonEmptyString(row.recognition_type) ?? "award";
    const allowedType = ["selection", "nomination", "award", "official_selection"].includes(
      recognition_type
    )
      ? recognition_type === "official_selection"
        ? "selection"
        : recognition_type === "selection"
          ? "selection"
          : recognition_type
      : "selection";

    out.push({
      festival_name,
      festival_year,
      section: nonEmptyString(row.section),
      recognition_type: allowedType,
      award_name: nonEmptyString(row.award_name),
      award_result: row.award_result ?? null,
      award_level: row.award_level ?? null,
      source_url: nonEmptyString(row.source_url),
      source_label: nonEmptyString(row.source_label),
      source_type: nonEmptyString(row.source_type) ?? "discovery_staging",
      original_text: nonEmptyString(row.original_text),
      import_source:
        nonEmptyString(row.import_source) ?? DISCOVERY_RELEASE_FESTIVAL_SOURCE,
      import_key: nonEmptyString(row.import_key),
    });
  }
  return out;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} filmId
 * @param {{
 *   festival_claims?: unknown,
 *   festival_recognitions?: unknown,
 * } | null | undefined} candidate
 */
export async function syncDiscoveryFestivalsToCatalog(
  supabase,
  filmId,
  candidate
) {
  if (!filmId || !candidate) {
    return { claims: 0, recognitions: 0 };
  }

  const claimRows = discoveryClaimsToCatalogRows(
    candidate.festival_claims,
    filmId
  );
  const recognitionInputs = discoveryRecognitionsToCatalogInputs(
    candidate.festival_recognitions
  );

  if (claimRows.length) {
    await upsertFilmFestivalClaims(supabase, filmId, claimRows);
  }
  if (recognitionInputs.length) {
    await upsertFilmFestivalRecognitions(supabase, filmId, recognitionInputs);
  }

  return {
    claims: claimRows.length,
    recognitions: recognitionInputs.length,
  };
}

/**
 * Load staging festival fields by candidate id, then sync.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} filmId
 * @param {string | null | undefined} discoveryCandidateId
 */
export async function syncDiscoveryFestivalsByCandidateId(
  supabase,
  filmId,
  discoveryCandidateId
) {
  const id = nonEmptyString(discoveryCandidateId);
  if (!id) {
    return { claims: 0, recognitions: 0, skipped: true };
  }

  const { data, error } = await supabase
    .from("film_discovery_candidates")
    .select("id, festival_claims, festival_recognitions")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { claims: 0, recognitions: 0, skipped: true };
  }

  const result = await syncDiscoveryFestivalsToCatalog(supabase, filmId, data);
  return { ...result, skipped: false };
}
