/**
 * Catalog/search field lists. Prefer including watch_availability; callers can
 * fall back if the hosted column is not migrated yet.
 */

export const PUBLIC_CATALOG_FILM_FIELDS_BASE = [
  "id",
  "title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "festival",
  "poster_url",
  "image_url",
  "trailer_url",
  "availability",
  "synopsis",
  "what_it_is",
  "the_mood",
  "technique",
  "material_fact",
  "cold_start_score",
  "quick_filters",
  "media_type",
];

export const PUBLIC_CATALOG_FILM_FIELDS_WITH_WATCH = [
  ...PUBLIC_CATALOG_FILM_FIELDS_BASE,
  "watch_availability",
].join(", ");

export const PUBLIC_CATALOG_FILM_FIELDS_WITHOUT_WATCH =
  PUBLIC_CATALOG_FILM_FIELDS_BASE.join(", ");

export const SEARCH_FILM_SELECT_FIELDS_BASE = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "poster_url",
  "image_url",
  "trailer_url",
  "availability",
  "synopsis",
  "what_it_is",
  "the_mood",
  "technique",
  "material_fact",
  "media_type",
  "moods",
  "aesthetic_tags",
  "narrative_tags",
];

export const SEARCH_FILM_SELECT_FIELDS_WITH_WATCH = [
  ...SEARCH_FILM_SELECT_FIELDS_BASE,
  "watch_availability",
].join(", ");

export const SEARCH_FILM_SELECT_FIELDS_WITHOUT_WATCH =
  SEARCH_FILM_SELECT_FIELDS_BASE.join(", ");

/**
 * @param {string | null | undefined} message
 */
export function isMissingWatchAvailabilityColumnError(message) {
  const text = String(message ?? "");
  return (
    /watch_availability/i.test(text) &&
    /(does not exist|could not find|schema cache|column)/i.test(text)
  );
}
