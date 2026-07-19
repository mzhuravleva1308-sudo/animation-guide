export const TRAILER_SOURCE_MANUAL = "manual";
export const TRAILER_SOURCE_AUTO = "auto";

/**
 * Automatic trailer lookup/write is allowed only when:
 * - trailer_url is empty, or
 * - --force is set AND existing source is explicitly auto.
 *
 * Manual and unmarked (legacy) trailers are never overwritten automatically,
 * including under --force.
 */
export function shouldAttemptTrailerLookup(film, { force = false } = {}) {
  const trailerUrl =
    typeof film?.trailer_url === "string" ? film.trailer_url.trim() : "";

  if (!trailerUrl) {
    return true;
  }

  if (!force) {
    return false;
  }

  return film?.trailer_source === TRAILER_SOURCE_AUTO;
}

export function buildAutoTrailerWritePayload(trailer) {
  return {
    trailer_url: trailer.url,
    trailer_provider: trailer.provider ?? null,
    trailer_video_id: trailer.video_id ?? null,
    trailer_source: TRAILER_SOURCE_AUTO,
  };
}

export function buildManualTrailerWritePayload({
  url,
  provider = "youtube",
  videoId,
}) {
  return {
    trailer_url: url,
    trailer_provider: provider,
    trailer_video_id: videoId,
    trailer_source: TRAILER_SOURCE_MANUAL,
  };
}
