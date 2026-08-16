/**
 * Pure helpers for choosing which films to score (full rebuild vs incremental).
 */

/**
 * Pick unrated candidate films, optionally restricted to a release/import set.
 *
 * @param {object[]} allFilms
 * @param {{ film_id: string, rating?: number | null }[]} ratings
 * @param {string[] | null | undefined} filmIdsRestrict
 * @param {(a: object, b: object) => number} [compareById]
 */
export function selectCandidateFilmsForScoring(
  allFilms,
  ratings,
  filmIdsRestrict = null,
  compareById = (a, b) => String(a.id).localeCompare(String(b.id))
) {
  const ratedFilmIds = new Set(
    (ratings ?? []).map((item) => item.film_id).filter(Boolean)
  );

  let candidateFilms = (allFilms ?? [])
    .filter((film) => film?.id && !ratedFilmIds.has(film.id))
    .sort(compareById);

  if (Array.isArray(filmIdsRestrict) && filmIdsRestrict.length) {
    const want = new Set(filmIdsRestrict.filter(Boolean));
    candidateFilms = candidateFilms.filter((film) => want.has(film.id));
  }

  return candidateFilms;
}
