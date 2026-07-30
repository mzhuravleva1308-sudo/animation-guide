import { isCachedPosterUrl } from "./film-poster.mjs";

export const POSTER_AUDIT_ISSUE = {
  MISSING_POSTER_URL: "missing_poster_url",
  EXTERNAL_POSTER_URL: "external_poster_url",
  BROKEN_STORAGE_POSTER: "broken_storage_poster",
};

/**
 * Classify a film's poster_url without performing HTTP checks.
 * @param {{ id: string, title?: string | null, poster_url?: string | null }} film
 * @param {string} supabaseUrl
 */
export function classifyFilmPoster(film, supabaseUrl) {
  const posterUrl = film?.poster_url ?? null;

  if (!posterUrl) {
    return {
      id: film.id,
      title: film.title ?? null,
      poster_url: null,
      issue: POSTER_AUDIT_ISSUE.MISSING_POSTER_URL,
    };
  }

  if (!isCachedPosterUrl(posterUrl, supabaseUrl)) {
    return {
      id: film.id,
      title: film.title ?? null,
      poster_url: posterUrl,
      issue: POSTER_AUDIT_ISSUE.EXTERNAL_POSTER_URL,
    };
  }

  return {
    id: film.id,
    title: film.title ?? null,
    poster_url: posterUrl,
    issue: null,
  };
}

/**
 * @param {Response} response
 */
export function isSuccessfulPosterResponse(response) {
  if (!response?.ok) {
    return false;
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType && !contentType.startsWith("image/")) {
    return false;
  }

  return true;
}

/**
 * Read-only audit of film posters.
 *
 * @param {Array<{ id: string, title?: string | null, poster_url?: string | null }>} films
 * @param {string} supabaseUrl
 * @param {{ checkUrl?: (url: string) => Promise<Response> }} [options]
 */
export async function auditFilmPosters(films, supabaseUrl, options = {}) {
  const checkUrl =
    options.checkUrl ??
    ((url) => fetch(url, { method: "HEAD", redirect: "follow" }));

  const classified = (films ?? []).map((film) =>
    classifyFilmPoster(film, supabaseUrl)
  );

  const missingPosterUrl = classified.filter(
    (row) => row.issue === POSTER_AUDIT_ISSUE.MISSING_POSTER_URL
  );
  const externalPosterUrl = classified.filter(
    (row) => row.issue === POSTER_AUDIT_ISSUE.EXTERNAL_POSTER_URL
  );
  const storageCandidates = classified.filter((row) => row.issue == null);

  const brokenStoragePoster = [];
  for (const row of storageCandidates) {
    try {
      const response = await checkUrl(row.poster_url);
      if (!isSuccessfulPosterResponse(response)) {
        brokenStoragePoster.push({
          ...row,
          issue: POSTER_AUDIT_ISSUE.BROKEN_STORAGE_POSTER,
          httpStatus: response.status,
        });
      }
    } catch (error) {
      brokenStoragePoster.push({
        ...row,
        issue: POSTER_AUDIT_ISSUE.BROKEN_STORAGE_POSTER,
        httpStatus: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const brokenIds = new Set(brokenStoragePoster.map((row) => row.id));
  const validCachedPosters = storageCandidates.filter(
    (row) => !brokenIds.has(row.id)
  );
  const issues = [
    ...missingPosterUrl,
    ...externalPosterUrl,
    ...brokenStoragePoster,
  ];

  return {
    total: classified.length,
    validCachedPosters: validCachedPosters.length,
    missingPosterUrl: missingPosterUrl.length,
    externalPosterUrl: externalPosterUrl.length,
    brokenStoragePoster: brokenStoragePoster.length,
    issues,
  };
}
