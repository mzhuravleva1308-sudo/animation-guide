/**
 * Public catalog visibility for films.
 * Service/admin/duplicate/scoring paths must not apply this filter.
 */

export const CATALOG_VISIBLE_COLUMN = "catalog_visible";

/**
 * @param {import("@supabase/supabase-js").PostgrestFilterBuilder} query
 */
export function applyPublicCatalogVisibilityFilter(query) {
  return query.eq(CATALOG_VISIBLE_COLUMN, true);
}

/**
 * @param {{ catalog_visible?: boolean | null } | null | undefined} film
 */
export function isPublicCatalogFilm(film) {
  return film?.catalog_visible !== false;
}

/**
 * @template {{ catalog_visible?: boolean | null }} T
 * @param {T[]} films
 */
export function filterPublicCatalogFilms(films) {
  return films.filter(isPublicCatalogFilm);
}

/**
 * Resolve import/batch catalog_visible with legacy default true.
 * @param {{ catalog_visible?: unknown }} film
 */
export function resolveCatalogVisibleForImport(film) {
  return typeof film?.catalog_visible === "boolean" ? film.catalog_visible : true;
}
