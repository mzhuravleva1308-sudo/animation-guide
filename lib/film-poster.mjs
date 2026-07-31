export const FILM_POSTERS_BUCKET = "film-posters";

export function getFilmPosterUrl(film) {
  return film.poster_url ?? film.image_url ?? null;
}

export function getExternalImageSource(film) {
  return film.external_image_url ?? film.image_url ?? null;
}

export function isCachedPosterUrl(url, supabaseUrl) {
  if (!url || !supabaseUrl) {
    return false;
  }

  const base = supabaseUrl.replace(/\/$/, "");
  return url.startsWith(
    `${base}/storage/v1/object/public/${FILM_POSTERS_BUCKET}/`
  );
}

/**
 * Whether cache-posters should download and store a poster for this film.
 * @param {{ poster_url?: string | null, external_image_url?: string | null, image_url?: string | null }} film
 * @param {string} supabaseUrl
 * @param {{ force?: boolean }} [options]
 */
export function filmNeedsPosterCache(film, supabaseUrl, options = {}) {
  const force = Boolean(options.force);

  if (film?.poster_url && !force) {
    return false;
  }

  const sourceUrl = getExternalImageSource(film);

  if (!sourceUrl) {
    return false;
  }

  if (isCachedPosterUrl(sourceUrl, supabaseUrl)) {
    return false;
  }

  return true;
}

/**
 * Host of the external poster source, if parseable.
 * @param {{ external_image_url?: string | null, image_url?: string | null }} film
 */
export function getExternalImageHost(film) {
  const sourceUrl = getExternalImageSource(film);
  if (!sourceUrl) {
    return null;
  }

  try {
    return new URL(sourceUrl).host;
  } catch {
    return null;
  }
}

/**
 * Clear error when a Storage poster is required but missing after caching.
 * @param {{ id?: string, title?: string, external_image_url?: string | null, image_url?: string | null }} film
 */
export function describeMissingStoragePoster(film) {
  const title = film?.title ?? "Unknown film";
  const id = film?.id ?? "unknown-id";
  const host = getExternalImageHost(film);
  const hostPart = host ? `; source host=${host}` : "";
  return (
    `Storage poster was not created for ${title} (${id})${hostPart}. ` +
    `Provide another downloadable source or upload the poster to ${FILM_POSTERS_BUCKET} manually.`
  );
}

export function extensionForContentType(contentType) {
  const normalized = (contentType ?? "").toLowerCase().split(";")[0].trim();

  switch (normalized) {
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/jpeg":
    case "image/jpg":
    default:
      return "jpg";
  }
}

export function buildPosterStoragePath(filmId, extension) {
  return `${filmId}.${extension}`;
}

export function buildPublicPosterUrl(supabaseUrl, filmId, extension) {
  const base = supabaseUrl.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${FILM_POSTERS_BUCKET}/${buildPosterStoragePath(
    filmId,
    extension
  )}`;
}
