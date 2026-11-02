/**
 * Resolve Apple TV / iTunes store deep links via the public Search API.
 * https://performance-partners.apple.com/search-api
 *
 * Strategy: search once to get trackId, then /lookup per country (cheaper, fewer 429s).
 */
import { getTitleSimilarity } from "./film-duplicate-check.mjs";

const ITUNES_SEARCH = "https://itunes.apple.com/search";
const ITUNES_LOOKUP = "https://itunes.apple.com/lookup";

export const APPLE_LINK_PRIORITY_REGIONS = [
  "US",
  "GB",
  "CA",
  "AU",
  "FR",
  "DE",
  "IE",
  "NZ",
  "JP",
  "ES",
  "IT",
  "NL",
  "PL",
  "AT",
  "CH",
  "SE",
  "DK",
  "NO",
  "FI",
  "BE",
  "MX",
  "BR",
  "PT",
  "KR",
  "TW",
  "HK",
  "SG",
];

const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "ResonaleCatalog/1.0 (+https://resonale.com)",
};

/**
 * @param {string} provider
 */
export function isAppleWatchProvider(provider) {
  const name = String(provider ?? "").trim();
  return name === "Apple TV" || name === "Apple TV+";
}

/**
 * Keep Apple regions we will actually deep-link, priority-first.
 * @param {string[]} regions
 * @param {number} [limit]
 */
export function prioritizeAppleLinkRegions(regions, limit = 20) {
  const set = new Set(
    (regions ?? []).map((r) => String(r ?? "").trim().toUpperCase())
  );
  const ordered = [];
  for (const code of APPLE_LINK_PRIORITY_REGIONS) {
    if (set.has(code)) ordered.push(code);
  }
  for (const code of [...set].sort()) {
    if (!ordered.includes(code)) ordered.push(code);
  }
  return ordered.slice(0, limit);
}

/**
 * @param {object[]} results
 * @param {string | null | undefined} title
 * @param {string | null | undefined} originalTitle
 * @param {number | null | undefined} year
 */
export function pickBestAppleResult(results, title, originalTitle, year) {
  if (!results.length) return null;

  const scored = results.map((result) => {
    const trackName = String(result.trackName ?? "");
    const titleSim = Math.max(
      getTitleSimilarity(title, trackName),
      getTitleSimilarity(originalTitle, trackName)
    );
    const releaseYear = String(result.releaseDate ?? "").slice(0, 4);
    const yearNum = Number(releaseYear);
    const yearDiff =
      year != null && Number.isFinite(year) && Number.isFinite(yearNum)
        ? Math.abs(yearNum - Number(year))
        : null;
    let score = titleSim;
    if (yearDiff === 0) score += 0.15;
    else if (yearDiff === 1) score += 0.05;
    else if (yearDiff != null && yearDiff > 2) score -= 0.35;
    return { result, titleSim, yearDiff, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.titleSim < 0.82) return null;
  if (best.yearDiff != null && best.yearDiff > 2) return null;
  return best.result;
}

/**
 * @param {Response} response
 * @param {string} label
 */
async function readItunesJson(response, label) {
  if (response.status === 403 || response.status === 429) {
    const text = await response.text().catch(() => "");
    const err = new Error(
      `iTunes ${label}: ${response.status} ${text.slice(0, 120)}`
    );
    err.status = response.status;
    throw err;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`iTunes ${label}: ${response.status} ${text.slice(0, 120)}`);
  }
  return response.json();
}

/**
 * @param {object} input
 * @param {string} input.title
 * @param {string | null | undefined} [input.originalTitle]
 * @param {number | null | undefined} [input.year]
 * @param {string} input.country
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<{ trackId: number, trackViewUrl: string } | null>}
 */
export async function searchAppleMovie(input) {
  const country = String(input.country ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z]{2}$/.test(country)) return null;

  const queries = [input.title, input.originalTitle]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (!queries.length) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  /** @type {Map<number, object>} */
  const byId = new Map();

  for (const term of [...new Set(queries)]) {
    const params = new URLSearchParams({
      term,
      country,
      media: "movie",
      entity: "movie",
      limit: "10",
    });
    const response = await fetchImpl(`${ITUNES_SEARCH}?${params.toString()}`, {
      headers: DEFAULT_HEADERS,
    });
    const data = await readItunesJson(response, `search ${country} "${term}"`);
    for (const result of data.results ?? []) {
      if (result?.trackId != null) {
        byId.set(result.trackId, result);
      }
    }
  }

  const best = pickBestAppleResult(
    [...byId.values()],
    input.title,
    input.originalTitle,
    input.year
  );
  const trackId = best?.trackId != null ? Number(best.trackId) : null;
  const trackViewUrl = best?.trackViewUrl
    ? String(best.trackViewUrl).trim()
    : "";
  if (trackId == null || !Number.isFinite(trackId) || !trackViewUrl) {
    return null;
  }
  return { trackId, trackViewUrl };
}

/**
 * @param {object} input
 * @param {number} input.trackId
 * @param {string} input.country
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<string | null>}
 */
export async function lookupAppleMovieUrl(input) {
  const country = String(input.country ?? "")
    .trim()
    .toLowerCase();
  const trackId = Number(input.trackId);
  if (!/^[a-z]{2}$/.test(country) || !Number.isFinite(trackId)) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    id: String(trackId),
    country,
    entity: "movie",
  });
  const response = await fetchImpl(`${ITUNES_LOOKUP}?${params.toString()}`, {
    headers: DEFAULT_HEADERS,
  });
  const data = await readItunesJson(response, `lookup ${country} ${trackId}`);
  const result = (data.results ?? []).find(
    (row) => Number(row?.trackId) === trackId || row?.kind === "feature-movie"
  );
  const url = result?.trackViewUrl ? String(result.trackViewUrl).trim() : "";
  return url || null;
}

/**
 * Resolve links for many countries with one search + lookups.
 * @param {object} input
 * @param {string} input.title
 * @param {string | null | undefined} [input.originalTitle]
 * @param {number | null | undefined} [input.year]
 * @param {string[]} input.regions
 * @param {number | null | undefined} [input.knownTrackId]
 * @param {typeof fetch} [input.fetchImpl]
 * @param {(ms: number) => Promise<void>} [input.sleep]
 * @returns {Promise<{ trackId: number | null, byRegion: Record<string, string> }>}
 */
export async function resolveAppleMovieLinksForRegions(input) {
  const regions = prioritizeAppleLinkRegions(input.regions ?? []);
  /** @type {Record<string, string>} */
  const byRegion = {};
  if (!regions.length) {
    return { trackId: input.knownTrackId ?? null, byRegion };
  }

  const sleep =
    input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let trackId =
    input.knownTrackId != null && Number.isFinite(Number(input.knownTrackId))
      ? Number(input.knownTrackId)
      : null;

  const searchCountry =
    regions.find((code) => code === "US") ??
    regions.find((code) => APPLE_LINK_PRIORITY_REGIONS.includes(code)) ??
    regions[0];

  if (trackId == null) {
    const match = await searchAppleMovie({
      title: input.title,
      originalTitle: input.originalTitle,
      year: input.year,
      country: searchCountry,
      fetchImpl: input.fetchImpl,
    });
    await sleep(350);
    if (!match) {
      return { trackId: null, byRegion };
    }
    trackId = match.trackId;
    byRegion[searchCountry.toUpperCase()] = match.trackViewUrl;
  }

  for (const region of regions) {
    const code = region.toUpperCase();
    if (byRegion[code]) continue;
    const url = await lookupAppleMovieUrl({
      trackId,
      country: code,
      fetchImpl: input.fetchImpl,
    });
    await sleep(350);
    if (url) byRegion[code] = url;
  }

  return { trackId, byRegion };
}

/**
 * @deprecated Prefer resolveAppleMovieLinksForRegions
 */
export async function resolveAppleMovieLink(input) {
  const match = await searchAppleMovie(input);
  return match?.trackViewUrl ?? null;
}
