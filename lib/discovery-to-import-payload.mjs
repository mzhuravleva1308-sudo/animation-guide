/**
 * Map an approved film_discovery_candidates row → film import payload.
 * Preserve-first: staging content/tags/media are copied as-is; never invent
 * replacements for filled fields. Discovery releases always start hidden.
 */

export const DISCOVERY_RELEASE_ORIGIN = "discovery_release";

export const DISCOVERY_RELEASE_STATUS = Object.freeze({
  notQueued: "not_queued",
  queued: "queued",
  blocked: "blocked",
  prepping: "prepping",
  readyForRelease: "ready_for_release",
  released: "released",
  failed: "failed",
});

const TMDB_HOST = /(?:^|\.)themoviedb\.org$/i;
const IMDB_HOST = /(?:^|\.)imdb\.com$/i;

/** Keep aligned with lib/film-import-enqueue.mjs parseTmdbIdFromSourceUrl. */
export function parseTmdbIdFromSourceUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/\/movie\/(\d+)(?:[-/?#]|$)/i);
  return match ? Number(match[1]) : null;
}

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
 * @param {unknown} value
 * @returns {string[]}
 */
function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

/**
 * technique on staging may be a string or string[].
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeTechniqueList(value) {
  if (Array.isArray(value)) {
    return [...new Set(stringList(value))];
  }
  const single = nonEmptyString(value);
  return single ? [single] : [];
}

/**
 * @param {string} url
 * @returns {URL | null}
 */
function tryParseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Map discovery source_urls (string[]) → import source_urls object.
 * @param {unknown} sourceUrls
 * @returns {{ official: string | null, festival: string | null, tmdb: string | null, imdb: string | null }}
 */
export function mapDiscoverySourceUrls(sourceUrls) {
  /** @type {{ official: string | null, festival: string | null, tmdb: string | null, imdb: string | null }} */
  const out = { official: null, festival: null, tmdb: null, imdb: null };
  const list = stringList(sourceUrls);

  for (const url of list) {
    const parsed = tryParseUrl(url);
    if (!parsed) continue;
    const host = parsed.hostname.replace(/^www\./i, "");
    if (TMDB_HOST.test(host) && !out.tmdb) {
      out.tmdb = url;
      continue;
    }
    if (IMDB_HOST.test(host) && !out.imdb) {
      out.imdb = url;
      continue;
    }
    if (/festival|annecy|ottawa|zagreb|hiroshima|animafest/i.test(host + parsed.pathname) && !out.festival) {
      out.festival = url;
      continue;
    }
    if (!out.official) {
      out.official = url;
    }
  }

  return out;
}

/**
 * Infer TMDB movie URL from a TMDB image poster path when source_urls lack it.
 * @param {string | null | undefined} posterUrl
 * @param {{ title?: string | null, year?: number | null, tmdbId?: number | null }} [hints]
 * @returns {string | null}
 */
export function inferTmdbUrlFromPoster(posterUrl, hints = {}) {
  if (hints.tmdbId != null && Number.isFinite(Number(hints.tmdbId))) {
    const id = Number(hints.tmdbId);
    const slug = nonEmptyString(hints.title)
      ? String(hints.title)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      : null;
    return slug
      ? `https://www.themoviedb.org/movie/${id}-${slug}`
      : `https://www.themoviedb.org/movie/${id}`;
  }
  // Poster path alone cannot recover numeric id — leave null.
  void posterUrl;
  return null;
}

/**
 * Normalize festival_recognitions from staging for import schema.
 * @param {unknown} value
 * @returns {object[]}
 */
export function mapDiscoveryFestivalRecognitions(value) {
  if (!Array.isArray(value)) return [];
  /** @type {object[]} */
  const out = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const festival_name = nonEmptyString(row.festival_name);
    const festival_year = Number(row.festival_year);
    const recognition_type = nonEmptyString(row.recognition_type) ?? "selection";
    const source_url = nonEmptyString(row.source_url);
    if (!festival_name || !Number.isInteger(festival_year) || !source_url) {
      continue;
    }
    const allowedType = ["selection", "nomination", "award"].includes(
      recognition_type
    )
      ? recognition_type
      : "selection";
    out.push({
      festival_name,
      festival_year,
      section: nonEmptyString(row.section),
      recognition_type: allowedType,
      award_name: nonEmptyString(row.award_name),
      award_result: row.award_result ?? null,
      award_level: row.award_level ?? null,
      source_url,
    });
  }
  return out;
}

/**
 * Hard blockers that prevent enqueue.
 * @param {object} candidate
 * @returns {string[]}
 */
export function getDiscoveryReleaseBlockers(candidate) {
  /** @type {string[]} */
  const blockers = [];
  if (!nonEmptyString(candidate?.title)) blockers.push("missing_title");
  if (!Number.isInteger(Number(candidate?.year))) blockers.push("missing_year");
  if (!nonEmptyString(candidate?.synopsis)) blockers.push("missing_synopsis");
  if (!nonEmptyString(candidate?.the_mood)) blockers.push("missing_the_mood");
  if (!normalizeTechniqueList(candidate?.technique).length) {
    blockers.push("missing_technique");
  }
  if (!stringList(candidate?.directors).length) blockers.push("missing_directors");
  if (!stringList(candidate?.countries).length) blockers.push("missing_countries");
  return blockers;
}

/**
 * Soft warnings (enqueue still allowed).
 * @param {object} payload
 * @returns {string[]}
 */
export function getDiscoveryReleaseWarnings(payload) {
  /** @type {string[]} */
  const warnings = [];
  if (!payload?.source_urls?.tmdb) warnings.push("missing_tmdb_url");
  if (!stringList(payload?.moods).length) warnings.push("missing_moods");
  if (!stringList(payload?.aesthetic_tags).length) {
    warnings.push("missing_aesthetic_tags");
  }
  if (!nonEmptyString(payload?.image_url) && !nonEmptyString(payload?.external_image_url)) {
    warnings.push("missing_poster");
  }
  return warnings;
}

/**
 * Build import-batch film object from a discovery candidate.
 * Always sets catalog_visible=false and origin=discovery_release.
 *
 * @param {object} candidate
 * @param {{ tmdbId?: number | null }} [options]
 * @returns {{
 *   ready: boolean,
 *   blockers: string[],
 *   warnings: string[],
 *   payload: object | null
 * }}
 */
export function buildDiscoveryReleasePayload(candidate, options = {}) {
  const blockers = getDiscoveryReleaseBlockers(candidate);
  if (blockers.length) {
    return { ready: false, blockers, warnings: [], payload: null };
  }

  let source_urls = mapDiscoverySourceUrls(candidate.source_urls);
  if (!source_urls.tmdb) {
    const inferred = inferTmdbUrlFromPoster(candidate.poster_url, {
      title: candidate.title,
      year: candidate.year,
      tmdbId: options.tmdbId ?? candidate.tmdb_id ?? null,
    });
    if (inferred) {
      source_urls = { ...source_urls, tmdb: inferred };
    }
  }

  const poster = nonEmptyString(candidate.poster_url);
  const trailer = nonEmptyString(candidate.trailer_url);
  const moods = stringList(candidate.moods);
  const aesthetic_tags = stringList(candidate.aesthetic_tags);
  const quick_filters = stringList(candidate.quick_filters).filter((token) =>
    ["sci-fi", "sarcasm", "connection", "distance"].includes(token)
  );

  const payload = {
    title: nonEmptyString(candidate.title),
    original_title: nonEmptyString(candidate.original_title),
    year: Number(candidate.year),
    runtime_minutes:
      candidate.runtime_minutes != null &&
      Number.isInteger(Number(candidate.runtime_minutes))
        ? Number(candidate.runtime_minutes)
        : undefined,
    countries: stringList(candidate.countries),
    directors: stringList(candidate.directors),
    synopsis: nonEmptyString(candidate.synopsis),
    the_mood: nonEmptyString(candidate.the_mood),
    technique: normalizeTechniqueList(candidate.technique),
    festival_recognitions: mapDiscoveryFestivalRecognitions(
      candidate.festival_recognitions
    ),
    source_urls,
    quick_filters,
    catalog_visible: false,
    origin: DISCOVERY_RELEASE_ORIGIN,
    discovery_candidate_id: candidate.id ?? null,
    moods: moods.length ? moods : undefined,
    aesthetic_tags: aesthetic_tags.length ? aesthetic_tags : undefined,
    // Staging poster → external image only; leave films.poster_url null for cache-posters.
    image_url: poster ?? undefined,
    external_image_url: poster ?? undefined,
    trailer_url: trailer ?? undefined,
    trailer_provider: nonEmptyString(candidate.trailer_provider) ?? undefined,
    trailer_video_id: nonEmptyString(candidate.trailer_video_id) ?? undefined,
    trailer_source: nonEmptyString(candidate.trailer_source) ?? undefined,
    notes: `discovery_release candidate=${candidate.id ?? "?"}`,
  };

  // Drop undefined optional keys for cleaner JSON / schema.
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }

  const warnings = getDiscoveryReleaseWarnings(payload);
  return { ready: true, blockers: [], warnings, payload };
}

/**
 * Initial checklist for a discovery-release queue row.
 * @param {{ warnings?: string[], preserved?: Record<string, boolean> }} [meta]
 */
export function buildInitialReleaseChecklist(meta = {}) {
  const preserved = meta.preserved ?? {};
  return {
    inserted: false,
    duplicate_skipped: false,
    moods: preserved.moods ? "preserved" : "pending",
    aesthetic_tags: preserved.aesthetic_tags ? "preserved" : "pending",
    mood_embedding: "pending",
    aesthetic_embedding: "pending",
    image_sourced: Boolean(preserved.image),
    poster_cached_storage: false,
    trailer: preserved.trailer ? "preserved" : "pending",
    profile_scores: "deferred",
    catalog_visible: false,
    released_at: null,
    release_batch_id: null,
    warnings: meta.warnings ?? [],
  };
}

/**
 * Merge checklist updates without regressing completed flags.
 * @param {Record<string, unknown> | null | undefined} current
 * @param {Record<string, unknown>} patch
 */
export function mergeReleaseChecklist(current, patch) {
  const base =
    current && typeof current === "object" ? { ...current } : {};
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) continue;
    const prev = base[key];
    if (prev === true && value === false) continue;
    if (prev === "preserved" && value === "filled") continue;
    if (prev === "done" && value !== "done") continue;
    if (prev === "enqueued" && value === "deferred") continue;
    base[key] = value;
  }
  return base;
}

export function isDiscoveryReleasePayload(film) {
  return film?.origin === DISCOVERY_RELEASE_ORIGIN;
}

export function shouldDeferProfileEnqueueForFilm(film) {
  if (isDiscoveryReleasePayload(film)) return true;
  if (film?.catalog_visible === false) return true;
  return false;
}

export function tmdbIdFromPayload(film) {
  return parseTmdbIdFromSourceUrl(film?.source_urls?.tmdb);
}
