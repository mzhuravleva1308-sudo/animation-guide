import { normalizeFilmString } from "./film-duplicate-check.mjs";
import { matchFestivalOfficialSource } from "./festival-official-sources.mjs";
import { normalizeOptionalText } from "./film-festival-recognition.mjs";

/** @typedef {import("./festival-official-sources.mjs").FestivalOfficialSource} FestivalOfficialSource */

export const CONFIDENCE_STATUSES = {
  CONFIRMED_OFFICIAL: "confirmed_official",
  CATALOG_CLAIM: "catalog_claim_unverified",
  WIKIPEDIA: "wikipedia_discovery_unverified",
  INCOMPLETE: "incomplete_candidate",
};

export const CANONICAL_FESTIVAL_NAMES = {
  annecy: "Annecy International Animation Film Festival",
  berlinale: "Berlinale",
  cannes: "Cannes Film Festival",
  venice: "Venice Film Festival",
  sundance: "Sundance Film Festival",
  ottawa: "Ottawa International Animation Festival",
  hiroshima: "Hiroshima International Animation Festival",
  animafest: "Animafest Zagreb",
  stuttgart: "Stuttgart International Festival of Animated Film",
  bfi_london: "BFI London Film Festival",
};

/**
 * @param {string | null | undefined} festivalName
 */
export function resolveCanonicalFestival(festivalName) {
  const sourceDisplayName = normalizeOptionalText(festivalName);
  if (!sourceDisplayName) {
    return {
      id: null,
      name: null,
      source_display_name: null,
    };
  }

  const source = matchFestivalOfficialSource(sourceDisplayName);
  if (source) {
    return {
      id: source.id,
      name: CANONICAL_FESTIVAL_NAMES[source.id] ?? sourceDisplayName,
      source_display_name: sourceDisplayName,
    };
  }

  return {
    id: null,
    name: sourceDisplayName,
    source_display_name: sourceDisplayName,
  };
}

/**
 * @param {string | null | undefined} festivalName
 */
export function isConfiguredCanonicalFestival(festivalName) {
  return resolveCanonicalFestival(festivalName).id != null;
}

/**
 * @param {string | null | undefined} url
 */
export function inferFestivalYearFromSourceUrl(url) {
  const normalized = normalizeOptionalText(url);
  if (!normalized) {
    return null;
  }

  const match =
    normalized.match(/\/archives[^/]*\/(\d{4})\//i) ??
    normalized.match(/\/(\d{4})(?:[:/]|\/)/) ??
    normalized.match(/\/(\d{4})[./]/);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return null;
  }

  return year;
}

/**
 * @param {string | null | undefined} url
 * @param {string | null | undefined} canonicalFestivalId
 */
export function isOfficialSourceUrlForFestival(url, canonicalFestivalId) {
  const normalized = normalizeOptionalText(url);
  if (!normalized || !canonicalFestivalId) {
    return false;
  }

  const source = matchFestivalOfficialSource(
    CANONICAL_FESTIVAL_NAMES[canonicalFestivalId] ?? canonicalFestivalId
  );
  if (!source) {
    return false;
  }

  try {
    const host = new URL(normalized).hostname.replace(/^www\./i, "");
    return source.domains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   source_url?: string | null,
 *   source_type?: string | null,
 *   canonical_festival_id?: string | null,
 *   festival_year?: number | null,
 *   import_source?: string | null,
 * }} row
 */
export function resolveConfidenceStatus(row) {
  const sourceUrl = normalizeOptionalText(row.source_url);
  const sourceType = normalizeOptionalText(row.source_type)?.toLowerCase() ?? null;
  let festivalYear = row.festival_year ?? null;

  if (festivalYear == null && sourceUrl) {
    festivalYear = inferFestivalYearFromSourceUrl(sourceUrl);
  }

  if (
    row.canonical_festival_id &&
    festivalYear == null &&
    !sourceUrl
  ) {
    return CONFIDENCE_STATUSES.INCOMPLETE;
  }

  if (
    sourceUrl &&
    (sourceType === "official_archive" ||
      isOfficialSourceUrlForFestival(sourceUrl, row.canonical_festival_id))
  ) {
    if (row.canonical_festival_id && festivalYear != null) {
      return CONFIDENCE_STATUSES.CONFIRMED_OFFICIAL;
    }

    if (row.canonical_festival_id && festivalYear == null) {
      return CONFIDENCE_STATUSES.INCOMPLETE;
    }
  }

  if (
    sourceType === "wikipedia" ||
    sourceUrl?.includes("wikipedia.org")
  ) {
    return CONFIDENCE_STATUSES.WIKIPEDIA;
  }

  if (
    sourceType === "catalog_field" ||
    (!sourceUrl && normalizeOptionalText(row.import_source))
  ) {
    return CONFIDENCE_STATUSES.CATALOG_CLAIM;
  }

  if (sourceUrl && !isOfficialSourceUrlForFestival(sourceUrl, row.canonical_festival_id)) {
    return CONFIDENCE_STATUSES.WIKIPEDIA;
  }

  return CONFIDENCE_STATUSES.INCOMPLETE;
}

/**
 * @param {string | null | undefined} value
 */
export function normalizeCanonicalSlug(value) {
  return normalizeFilmString(String(value ?? ""), { stripArticles: true });
}
