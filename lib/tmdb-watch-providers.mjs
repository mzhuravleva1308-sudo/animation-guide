/**
 * Fetch TMDB watch/providers and build films.watch_availability snapshots.
 * Used by import pipelines and missing-only weekly backfill.
 */
import {
  buildWatchAvailabilityFromTmdbResults,
  isWatchAvailabilityStale,
  normalizeWatchAvailability,
} from "./film-watch-availability.mjs";

/** Monthly recheck cadence for films that already checked but have zero offers. */
export const EMPTY_WATCH_RECHECK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {import("./film-watch-availability.mjs").FilmWatchAvailability | null | undefined} next
 * @param {import("./film-watch-availability.mjs").FilmWatchAvailability | null | undefined} current
 */
export function preserveWatchDeepLinks(next, current) {
  if (!next) return next;
  next.apple_links = current?.apple_links ?? next.apple_links ?? null;
  next.mubi_links = current?.mubi_links ?? next.mubi_links ?? null;
  next.amazon_links = current?.amazon_links ?? next.amazon_links ?? null;
  next.prime_links = current?.prime_links ?? next.prime_links ?? null;
  next.youtube_links = current?.youtube_links ?? next.youtube_links ?? null;
  return next;
}

/**
 * True when the film has no usable TMDB watch snapshot yet.
 * Empty offers with checked_at still count as “has data” (already checked).
 * @param {unknown} value
 */
export function isMissingWatchAvailability(value) {
  return normalizeWatchAvailability(value) == null;
}

/**
 * Snapshot exists but TMDB currently lists no curated providers.
 * @param {unknown} value
 */
export function isEmptyWatchAvailability(value) {
  const normalized = normalizeWatchAvailability(value);
  return Boolean(normalized) && normalized.offers.length === 0;
}

/**
 * Recheck empty snapshots once they age past the monthly window.
 * @param {unknown} value
 * @param {{ now?: number, maxAgeMs?: number }} [options]
 */
export function needsEmptyWatchRecheck(value, options = {}) {
  const normalized = normalizeWatchAvailability(value);
  if (!normalized || normalized.offers.length > 0) return false;
  return isWatchAvailabilityStale(normalized.checked_at, {
    now: options.now,
    maxAgeMs: options.maxAgeMs ?? EMPTY_WATCH_RECHECK_MAX_AGE_MS,
  });
}

/**
 * @param {object} input
 * @param {number} input.tmdbId
 * @param {string} input.apiKey
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<{ ok: true, status: number, results: Record<string, unknown> } | { ok: false, status: number, results: Record<string, never> }>}
 */
export async function fetchTmdbWatchProviderResults(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const tmdbId = Number(input.tmdbId);
  if (!Number.isFinite(tmdbId)) {
    throw new Error("tmdbId is required");
  }
  const url = new URL(
    `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers`
  );
  url.searchParams.set("api_key", input.apiKey);
  const response = await fetchImpl(url);
  if (response.status === 404) {
    return { ok: false, status: 404, results: {} };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `TMDB watch/providers ${tmdbId}: ${response.status} ${text.slice(0, 120)}`
    );
  }
  const data = await response.json();
  return {
    ok: true,
    status: response.status,
    results: /** @type {Record<string, unknown>} */ (data.results ?? {}),
  };
}

/**
 * @param {object} input
 * @param {number} input.tmdbId
 * @param {string} input.apiKey
 * @param {unknown} [input.current]
 * @param {string} [input.checkedAt]
 * @param {typeof fetch} [input.fetchImpl]
 */
export async function loadWatchAvailabilityFromTmdb(input) {
  const tmdbId = Number(input.tmdbId);
  const current = normalizeWatchAvailability(input.current);
  const fetched = await fetchTmdbWatchProviderResults({
    tmdbId,
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
  });
  const next = buildWatchAvailabilityFromTmdbResults(fetched.results, {
    tmdbId,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
  });
  return preserveWatchDeepLinks(next, current);
}
