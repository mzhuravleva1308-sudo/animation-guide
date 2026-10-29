/**
 * Review-care signals applied on every discovery candidate import
 * (manual seed + weekly): kids suspicion + near catalog duplicate suspicion.
 * Does not reject — only flags for careful pending review.
 */

import {
  DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN,
  DISCOVERY_REVIEW_FLAG_POSSIBLE_CATALOG_DUPLICATE,
  assessDiscoveryChildrenAudience,
  buildPrimarilyForChildrenFlagPatch,
  withDiscoveryReviewFlag,
  getDiscoveryReviewFlags,
} from "./film-discovery-children-audience.mjs";
import {
  findNearCatalogDuplicates,
  formatNearCatalogDuplicateReason,
} from "./film-discovery-pending-review.mjs";

export { DISCOVERY_REVIEW_FLAG_POSSIBLE_CATALOG_DUPLICATE };

/**
 * @param {{
 *   review_flags?: unknown,
 *   eligibility_evidence?: unknown,
 * } | null | undefined} row
 * @param {Array<{
 *   id?: string | null,
 *   title: string,
 *   year: number,
 *   match?: string,
 *   year_delta?: number,
 * }>} matches
 */
export function buildPossibleCatalogDuplicateFlagPatch(row, matches) {
  const evidence =
    row?.eligibility_evidence && typeof row.eligibility_evidence === "object"
      ? { ...row.eligibility_evidence }
      : {};
  const flags = withDiscoveryReviewFlag(
    getDiscoveryReviewFlags(row),
    DISCOVERY_REVIEW_FLAG_POSSIBLE_CATALOG_DUPLICATE
  );
  evidence.review_flags = flags;
  evidence.possible_catalog_duplicate = true;
  evidence.possible_catalog_duplicates = matches;
  const reason = formatNearCatalogDuplicateReason(matches);
  if (reason) evidence.possible_catalog_duplicate_reason = reason;
  return {
    review_flags: flags,
    eligibility_evidence: evidence,
  };
}

/**
 * Apply kids + near-dupe suspicion onto a staging candidate row (pure).
 *
 * @param {object} row
 * @param {{
 *   catalogFilms?: object[],
 *   tmdbGenres?: string[] | null,
 *   festivalSection?: string | null,
 * }} [options]
 * @returns {{
 *   row: object,
 *   signals: {
 *     primarily_for_children: boolean,
 *     possible_catalog_duplicate: boolean,
 *     kids_reasons: string[],
 *     near_duplicates: object[],
 *   },
 * }}
 */
export function applyDiscoveryImportReviewSignals(row, options = {}) {
  let next = {
    ...row,
    eligibility_evidence:
      row?.eligibility_evidence && typeof row.eligibility_evidence === "object"
        ? { ...row.eligibility_evidence }
        : {},
  };

  const nearDuplicates = findNearCatalogDuplicates(
    next,
    options.catalogFilms ?? []
  );
  if (nearDuplicates.length > 0) {
    const patch = buildPossibleCatalogDuplicateFlagPatch(next, nearDuplicates);
    next = {
      ...next,
      review_flags: patch.review_flags,
      eligibility_evidence: patch.eligibility_evidence,
    };
  }

  const kids = assessDiscoveryChildrenAudience({
    title: next.title,
    synopsis: next.synopsis,
    the_mood: next.the_mood,
    content_note: next.content_note,
    festival_section:
      options.festivalSection ??
      next.festival_section ??
      next.section ??
      null,
    tmdb_genres: options.tmdbGenres ?? null,
  });

  if (kids.primarily_for_children) {
    const patch = buildPrimarilyForChildrenFlagPatch(next);
    const evidence = {
      ...patch.eligibility_evidence,
      children_audience_reasons: kids.reasons,
      children_audience_confidence: kids.confidence,
    };
    next = {
      ...next,
      review_flags: patch.review_flags,
      eligibility_evidence: evidence,
    };
  }

  return {
    row: next,
    signals: {
      primarily_for_children: Boolean(kids.primarily_for_children),
      possible_catalog_duplicate: nearDuplicates.length > 0,
      kids_reasons: kids.reasons,
      near_duplicates: nearDuplicates,
    },
  };
}

/**
 * Lightweight TMDB genre lookup for kids Family signal at import time.
 * @param {string} apiKey
 * @param {{ title: string, year?: number | null, original_title?: string | null }} film
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<string[]>}
 */
export async function fetchTmdbGenresForImportReview(apiKey, film, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!apiKey || !film?.title) return [];

  const queries = [film.title, film.original_title].filter(Boolean);
  /** @type {object | null} */
  let hit = null;

  for (const query of queries) {
    const params = new URLSearchParams({
      api_key: apiKey,
      query: String(query),
      include_adult: "false",
    });
    if (Number.isInteger(film.year)) params.set("year", String(film.year));
    const search = await fetchImpl(
      `https://api.themoviedb.org/3/search/movie?${params.toString()}`
    );
    if (!search.ok) continue;
    const body = await search.json();
    const results = Array.isArray(body.results) ? body.results : [];
    hit =
      results.find(
        (row) =>
          String(row.title ?? "").toLowerCase() ===
          String(film.title).toLowerCase()
      ) ??
      results[0] ??
      null;
    if (hit?.id) break;
  }

  if (!hit?.id) return [];
  const detail = await fetchImpl(
    `https://api.themoviedb.org/3/movie/${hit.id}?api_key=${apiKey}`
  );
  if (!detail.ok) return [];
  const movie = await detail.json();
  return (movie.genres ?? []).map((genre) => String(genre.name));
}

/**
 * Enrich insert rows with import review signals (kids + near-dupe).
 *
 * @param {object[]} rows
 * @param {{
 *   catalogFilms?: object[],
 *   tmdbApiKey?: string | null,
 *   fetchTmdbGenresFn?: typeof fetchTmdbGenresForImportReview,
 *   delayMs?: number,
 * }} [options]
 */
export async function enrichDiscoveryImportRowsWithReviewSignals(
  rows,
  options = {}
) {
  const catalogFilms = options.catalogFilms ?? [];
  const tmdbApiKey = options.tmdbApiKey ?? null;
  const fetchTmdbGenresFn =
    options.fetchTmdbGenresFn ?? fetchTmdbGenresForImportReview;
  const delayMs = options.delayMs ?? 0;

  /** @type {object[]} */
  const out = [];
  /** @type {{ title: string, year: number | null, primarily_for_children: boolean, possible_catalog_duplicate: boolean }[]} */
  const summary = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    /** @type {string[]} */
    let tmdbGenres = [];
    if (tmdbApiKey) {
      try {
        tmdbGenres = await fetchTmdbGenresFn(tmdbApiKey, {
          title: row.title,
          year: row.year,
          original_title: row.original_title,
        });
      } catch {
        tmdbGenres = [];
      }
    }

    const applied = applyDiscoveryImportReviewSignals(row, {
      catalogFilms,
      tmdbGenres,
    });
    out.push(applied.row);
    summary.push({
      title: row.title,
      year: row.year ?? null,
      primarily_for_children: applied.signals.primarily_for_children,
      possible_catalog_duplicate: applied.signals.possible_catalog_duplicate,
    });

    if (delayMs > 0 && index < rows.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    rows: out,
    flagged_kids: summary.filter((row) => row.primarily_for_children).length,
    flagged_near_duplicates: summary.filter(
      (row) => row.possible_catalog_duplicate
    ).length,
    summary,
  };
}

export {
  DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN,
  withDiscoveryReviewFlag,
  getDiscoveryReviewFlags,
};
