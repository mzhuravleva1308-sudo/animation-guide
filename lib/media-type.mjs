/**
 * Catalog media types and profile score modes (native vs cross-media).
 */

export const MEDIA_TYPE = Object.freeze({
  animation: "animation",
  liveAction: "live_action",
});

export const MEDIA_TYPES = Object.freeze([
  MEDIA_TYPE.animation,
  MEDIA_TYPE.liveAction,
]);

export const SCORE_MODE = Object.freeze({
  native: "native",
  crossMedia: "cross_media",
});

export const SCORE_MODES = Object.freeze([
  SCORE_MODE.native,
  SCORE_MODE.crossMedia,
]);

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function normalizeMediaType(value, fallback = MEDIA_TYPE.animation) {
  if (value === MEDIA_TYPE.animation || value === MEDIA_TYPE.liveAction) {
    return value;
  }
  return fallback;
}

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function normalizeScoreMode(value, fallback = SCORE_MODE.native) {
  if (value === SCORE_MODE.native || value === SCORE_MODE.crossMedia) {
    return value;
  }
  return fallback;
}

/**
 * Opposite catalog media for cross-media transfer.
 * @param {string} mediaType
 */
export function oppositeMediaType(mediaType) {
  return mediaType === MEDIA_TYPE.liveAction
    ? MEDIA_TYPE.animation
    : MEDIA_TYPE.liveAction;
}

/**
 * Parse catalog URL/search params into media + score artifact selection.
 * - media=animation|live_action (default animation)
 * - sort=native|cross_from_animation|cross_from_live_action (default native)
 *
 * @param {{ media?: string | null, sort?: string | null } | URLSearchParams | null | undefined} params
 */
export function parseCatalogRankingParams(params) {
  const get = (key) => {
    if (!params) return null;
    if (typeof params.get === "function") return params.get(key);
    return params[key] ?? null;
  };

  const mediaType = normalizeMediaType(get("media"), MEDIA_TYPE.animation);
  const sortRaw = String(get("sort") ?? "native").trim().toLowerCase();

  if (sortRaw === "cross_from_animation") {
    return {
      mediaType,
      scoreMode: SCORE_MODE.crossMedia,
      sourceMedia: MEDIA_TYPE.animation,
      sortParam: "cross_from_animation",
    };
  }

  if (
    sortRaw === "cross_from_live_action" ||
    sortRaw === "cross_from_film" ||
    sortRaw === "cross_from_films"
  ) {
    return {
      mediaType,
      scoreMode: SCORE_MODE.crossMedia,
      sourceMedia: MEDIA_TYPE.liveAction,
      sortParam: "cross_from_live_action",
    };
  }

  return {
    mediaType,
    scoreMode: SCORE_MODE.native,
    sourceMedia: mediaType,
    sortParam: "native",
  };
}

/**
 * Human label for the other catalog (cross-media CTA).
 * @param {string} sourceMedia
 */
export function crossMediaSortLabel(sourceMedia) {
  if (sourceMedia === MEDIA_TYPE.animation) {
    return "Based on your animation taste";
  }
  return "Based on your film taste";
}
