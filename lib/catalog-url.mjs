import { MEDIA_TYPE, normalizeMediaType } from "./media-type.mjs";
import {
  getQuickFiltersForMedia,
  isAllowedQuickFilter,
} from "./quick-film-filters.mjs";

export const CATALOG_FILTER_QUERY_PARAM = "filter";

/**
 * @param {unknown} raw
 * @param {string} [mediaType]
 * @returns {string | null}
 */
export function parseCatalogQuickFilter(raw, mediaType) {
  if (typeof raw !== "string") {
    return null;
  }

  const filter = raw.trim();
  if (!filter) {
    return null;
  }

  const media = normalizeMediaType(mediaType, MEDIA_TYPE.animation);
  return isAllowedQuickFilter(filter, getQuickFiltersForMedia(media))
    ? filter
    : null;
}

/**
 * Shareable catalog path. Omits default animation media and a cleared filter.
 *
 * @param {{ media?: string | null, filter?: string | null }} [input]
 * @returns {string}
 */
export function buildCatalogPath(input = {}) {
  const mediaType = normalizeMediaType(input.media, MEDIA_TYPE.animation);
  const filter = parseCatalogQuickFilter(input.filter, mediaType);
  const params = new URLSearchParams();

  if (mediaType !== MEDIA_TYPE.animation) {
    params.set("media", mediaType);
  }

  if (filter) {
    params.set(CATALOG_FILTER_QUERY_PARAM, filter);
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

/**
 * @param {{ media?: string | null, filter?: string | null }} input
 */
export function syncCatalogUrl(input) {
  if (typeof window === "undefined") {
    return;
  }

  const next = buildCatalogPath(input);
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) {
    window.history.replaceState(window.history.state, "", next);
  }
}
