/**
 * Discovery staging helpers for public catalog quick filters.
 *
 * Manual tokens mirror films.quick_filters / film-import-batch.schema.json:
 *   sci-fi | connection (Light) | distance (Shadow)
 * Derived chips (stop-motion from technique, recent from year) are computed
 * at display time — same rules as lib/quick-film-filters.ts.
 */

import { discoveryHasFestival } from "./film-discovery-festival-participation.mjs";

export const DISCOVERY_QUICK_FILTER_TOKENS = Object.freeze([
  "sci-fi",
  "connection",
  "distance",
]);

const TOKEN_SET = new Set(DISCOVERY_QUICK_FILTER_TOKENS);

/** UI labels for admin review (same as public QuickFilters chips). */
export const DISCOVERY_QUICK_FILTER_LABELS = Object.freeze({
  "sci-fi": "Sci-Fi",
  connection: "Light",
  distance: "Shadow",
  "stop-motion": "Stop motion",
  recent: "Recent",
  festival: "Festival",
  "award-winners": "Award winners",
});

const STOP_MOTION_TERMS = Object.freeze([
  "stop motion",
  "stop-motion",
  "stopmotion",
  "clay",
  "claymation",
  "plasticine",
  "puppet",
  "puppetry",
  "object animation",
  "object-animation",
]);

/**
 * @param {string | null | undefined} technique
 */
export function isStopMotionTechnique(technique) {
  const value = String(technique ?? "").toLowerCase();
  return STOP_MOTION_TERMS.some((term) => value.includes(term));
}

/**
 * @param {number | null | undefined} year
 * @param {number} [nowYear]
 */
export function isRecentFilmYear(year, nowYear = new Date().getFullYear()) {
  if (typeof year !== "number" || !Number.isFinite(year)) return false;
  return year >= nowYear - 2 && year <= nowYear;
}

/**
 * Normalize manual quick_filters to the closed production vocabulary.
 * connection and distance are mutually exclusive; if both present, drop both
 * (middle / uncertain) rather than guessing.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeDiscoveryQuickFilters(value) {
  const raw = Array.isArray(value) ? value : [];
  /** @type {string[]} */
  const tokens = [];
  const seen = new Set();
  for (const item of raw) {
    const token = String(item ?? "")
      .trim()
      .toLowerCase();
    if (!TOKEN_SET.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  if (seen.has("connection") && seen.has("distance")) {
    return tokens.filter((t) => t !== "connection" && t !== "distance");
  }
  return tokens;
}

/**
 * Prompt rules for content curator — match import-batch contract, do not invent
 * new Light/Shadow criteria.
 */
export function buildQuickFiltersPromptSection() {
  return `
CATALOG quick_filters (manual tokens only — same as public Sci-Fi / Light / Shadow):
Allowed tokens ONLY: "sci-fi", "connection", "distance".
- "sci-fi": stories shaped by technology, space, imagined futures (same meaning as the public Sci-Fi chip).
- "connection": Light chip — more warmth, connection, emotional closeness.
- "distance": Shadow chip — more distance, isolation, emotional darkness.
Rules:
- connection and distance are mutually exclusive. If the film is in the middle, omit BOTH.
- sci-fi may stand alone or combine with connection OR distance.
- Do NOT invent other tokens. Do NOT store stop-motion / recent / festival / award-winners here (those are derived: stop-motion from technique, recent from year, festival from Resonale major festival claims/awards, award-winners from festival_recognitions).
- Prefer [] over guessing when unsure.
`.trim();
}

/**
 * Admin preview pills: derived + proposed manual tokens.
 *
 * @param {{
 *   year?: number | null,
 *   technique?: string | null,
 *   quick_filters?: string[] | null,
 *   has_festival?: boolean | null,
 *   festival_claims?: unknown,
 *   festival_recognitions?: unknown,
 * }} film
 * @returns {{ id: string, label: string, source: "derived" | "proposed" }[]}
 */
export function buildDiscoveryCatalogFilterPills(film) {
  /** @type {{ id: string, label: string, source: "derived" | "proposed" }[]} */
  const pills = [];
  if (isRecentFilmYear(film.year)) {
    pills.push({
      id: "recent",
      label: DISCOVERY_QUICK_FILTER_LABELS.recent,
      source: "derived",
    });
  }
  if (isStopMotionTechnique(film.technique)) {
    pills.push({
      id: "stop-motion",
      label: DISCOVERY_QUICK_FILTER_LABELS["stop-motion"],
      source: "derived",
    });
  }
  // Festival filter: Resonale major festivals only.
  if (discoveryHasFestival(film)) {
    pills.push({
      id: "festival",
      label: DISCOVERY_QUICK_FILTER_LABELS.festival,
      source: "derived",
    });
  }
  // Award winners: staging AI uses "winner"; catalog chip uses verified grand_prize.
  if (
    Array.isArray(film.festival_recognitions) &&
    film.festival_recognitions.some((row) => {
      if (!row || typeof row !== "object") return false;
      const type = String(row.recognition_type ?? "").toLowerCase();
      const result = String(row.award_result ?? "").toLowerCase();
      if (type && type !== "award") return false;
      return (
        result === "winner" ||
        result === "grand_prize" ||
        result === "jury_prize"
      );
    })
  ) {
    pills.push({
      id: "award-winners",
      label: DISCOVERY_QUICK_FILTER_LABELS["award-winners"],
      source: "derived",
    });
  }
  for (const token of normalizeDiscoveryQuickFilters(film.quick_filters)) {
    pills.push({
      id: token,
      label:
        DISCOVERY_QUICK_FILTER_LABELS[
          /** @type {keyof typeof DISCOVERY_QUICK_FILTER_LABELS} */ (token)
        ] ?? token,
      source: "proposed",
    });
  }
  return pills;
}
