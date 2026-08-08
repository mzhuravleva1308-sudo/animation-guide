/**
 * Festival award wins for discovery staging.
 * Reuses catalog AI winners extractor (lib/ai-festival-winners.mjs).
 * Does not write to films or film_festival_recognitions.
 */

import {
  AI_FESTIVAL_WINNERS_SOURCE,
  extractAiFestivalWinners,
} from "./ai-festival-winners.mjs";

/**
 * @param {object} candidate
 * @returns {{
 *   title: string,
 *   original_title: string | null,
 *   year: number | null,
 *   director: string | null,
 *   country: string | null,
 * }}
 */
export function discoveryCandidateToFestivalFilmInput(candidate) {
  const directors = Array.isArray(candidate.directors)
    ? candidate.directors.map((d) => String(d).trim()).filter(Boolean)
    : [];
  const countries = Array.isArray(candidate.countries)
    ? candidate.countries.map((c) => String(c).trim()).filter(Boolean)
    : [];
  return {
    title: String(candidate.title ?? ""),
    original_title: candidate.original_title ?? null,
    year: candidate.year ?? null,
    director: directors[0] ?? null,
    country: countries[0] ?? null,
  };
}

/**
 * Compact JSON-safe rows for film_discovery_candidates.festival_recognitions.
 * @param {object[]} recognitions
 * @returns {object[]}
 */
export function toDiscoveryFestivalRecognitionRows(recognitions) {
  const list = Array.isArray(recognitions) ? recognitions : [];
  return list.map((row) => ({
    festival_name: row.festival_name ?? null,
    festival_year: row.festival_year ?? null,
    section: row.section ?? null,
    recognition_type: row.recognition_type ?? "award",
    award_name: row.award_name ?? null,
    award_result: row.award_result ?? "winner",
    source_url: row.source_url ?? null,
    source_label: row.source_label ?? null,
    source_type: row.source_type ?? "ai_inference",
    original_text: row.original_text ?? null,
    import_source: row.import_source ?? AI_FESTIVAL_WINNERS_SOURCE,
    import_key: row.import_key ?? null,
  }));
}

/**
 * True when staging recognitions look like award wins (admin Award winners pill).
 * Staging AI uses award_result "winner"; catalog Award winners chip uses verified grand_prize.
 *
 * @param {unknown} recognitions
 */
export function discoveryHasAwardWin(recognitions) {
  if (!Array.isArray(recognitions) || !recognitions.length) return false;
  return recognitions.some((row) => {
    if (!row || typeof row !== "object") return false;
    const type = String(row.recognition_type ?? "").toLowerCase();
    const result = String(row.award_result ?? "").toLowerCase();
    if (type && type !== "award") return false;
    return result === "winner" || result === "grand_prize" || result === "jury_prize";
  });
}

/**
 * Format short admin label list.
 * @param {unknown} recognitions
 * @returns {string[]}
 */
export function formatDiscoveryFestivalLabels(recognitions) {
  if (!Array.isArray(recognitions)) return [];
  /** @type {string[]} */
  const labels = [];
  for (const row of recognitions) {
    if (!row || typeof row !== "object") continue;
    const fest = String(row.festival_name ?? "").trim();
    const award = String(row.award_name ?? "").trim();
    const year = row.festival_year != null ? String(row.festival_year) : "";
    if (!fest && !award) continue;
    const parts = [fest, award, year].filter(Boolean);
    labels.push(parts.join(" · "));
  }
  return labels;
}

/**
 * @param {import("openai").OpenAI} openai
 * @param {object} candidate
 * @returns {Promise<{ ok: true, recognitions: object[] } | { ok: false, error: string }>}
 */
export async function extractDiscoveryFestivalRecognitions(openai, candidate) {
  const film = discoveryCandidateToFestivalFilmInput(candidate);
  if (!film.title) {
    return { ok: false, error: "candidate title required" };
  }
  const parsed = await extractAiFestivalWinners(openai, film);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error ?? "festival parse failed" };
  }
  return {
    ok: true,
    recognitions: toDiscoveryFestivalRecognitionRows(parsed.value),
  };
}
