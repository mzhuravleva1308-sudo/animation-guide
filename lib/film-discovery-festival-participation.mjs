/**
 * Festival participation (yes/no) for discovery staging.
 * Powers the Festival filter flag — distinct from award wins.
 * Reuses catalog AI participation extractor (lib/ai-festival-discovery.mjs).
 * Does not write to films or film_festival_claims.
 */

import {
  AI_DISCOVERY_SOURCE,
  extractAiFestivalCandidates,
} from "./ai-festival-discovery.mjs";
import {
  discoveryCandidateToFestivalFilmInput,
  discoveryHasAwardWin,
} from "./film-discovery-festivals.mjs";

/**
 * Compact JSON-safe rows for film_discovery_candidates.festival_claims.
 * @param {object[]} claims
 * @returns {object[]}
 */
export function toDiscoveryFestivalClaimRows(claims) {
  const list = Array.isArray(claims) ? claims : [];
  return list.map((row) => ({
    festival_name: row.festival_name ?? null,
    festival_year: row.festival_year ?? null,
    section: row.section ?? null,
    recognition_type: row.recognition_type ?? "possible_participation",
    source_url: row.source_url ?? null,
    source_label: row.source_label ?? null,
    source_type: row.source_type ?? "ai_inference",
    original_text: row.original_text ?? null,
    acceptance_reason: row.acceptance_reason ?? null,
    import_source: row.discovery_source ?? AI_DISCOVERY_SOURCE,
  }));
}

/**
 * Festival filter yes/no from claims and/or known award wins.
 * Award win implies participation.
 *
 * @param {{
 *   festival_claims?: unknown,
 *   festival_recognitions?: unknown,
 *   has_festival?: boolean | null,
 * }} film
 * @returns {boolean}
 */
export function discoveryHasFestival(film) {
  if (film?.has_festival === true) return true;
  if (Array.isArray(film?.festival_claims) && film.festival_claims.length > 0) {
    return true;
  }
  if (discoveryHasAwardWin(film?.festival_recognitions)) return true;
  return false;
}

/**
 * Short admin labels for participation claims.
 * @param {unknown} claims
 * @returns {string[]}
 */
export function formatDiscoveryFestivalClaimLabels(claims) {
  if (!Array.isArray(claims)) return [];
  /** @type {string[]} */
  const labels = [];
  for (const row of claims) {
    if (!row || typeof row !== "object") continue;
    const fest = String(row.festival_name ?? "").trim();
    const year = row.festival_year != null ? String(row.festival_year) : "";
    if (!fest) continue;
    labels.push([fest, year].filter(Boolean).join(" · "));
  }
  return labels;
}

/**
 * @param {import("openai").OpenAI} openai
 * @param {object} candidate
 * @returns {Promise<
 *   | { ok: true, has_festival: boolean, claims: object[] }
 *   | { ok: false, error: string }
 * >}
 */
export async function extractDiscoveryFestivalParticipation(openai, candidate) {
  const film = discoveryCandidateToFestivalFilmInput(candidate);
  if (!film.title) {
    return { ok: false, error: "candidate title required" };
  }

  let raw;
  try {
    raw = await extractAiFestivalCandidates(openai, film);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const claims = toDiscoveryFestivalClaimRows(raw);
  const hasFromClaims = claims.length > 0;
  const hasFromAwards = discoveryHasAwardWin(candidate.festival_recognitions);
  return {
    ok: true,
    has_festival: hasFromClaims || hasFromAwards,
    claims,
  };
}
