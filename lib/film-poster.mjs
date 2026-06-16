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
