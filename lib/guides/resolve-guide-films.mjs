/**
 * Resolve editorial guide titles against live catalog rows.
 * Order is always the editorial order — never personalized.
 */

/**
 * @typedef {{ title: string, note?: string }} GuideFilmEntry
 * @typedef {{ heading: string, description: string, films: GuideFilmEntry[] }} GuideGroup
 * @typedef {{
 *   slug: string,
 *   h1: string,
 *   documentTitle?: string,
 *   metaDescription?: string,
 *   intro: string[],
 *   personalNote: string,
 *   cta: { href: string, label: string },
 *   relatedGuides?: { href: string, label: string }[],
 *   anchorTitle?: string,
 *   groups: GuideGroup[],
 * }} GuidePageContent
 * @typedef {{ id: string, title: string }} GuideFilmLike
 */

/**
 * @param {GuidePageContent} guide
 * @returns {string[]}
 */
export function listGuideFilmTitles(guide) {
  return (guide?.groups ?? []).flatMap((group) =>
    (group.films ?? []).map((entry) => entry.title)
  );
}

/**
 * @template {GuideFilmLike} T
 * @param {GuidePageContent} guide
 * @param {T[]} films
 * @returns {{
 *   groups: { heading: string, description: string, items: { film: T, note: string | null }[] }[],
 *   missingTitles: string[],
 * }}
 */
export function resolveGuideFilms(guide, films) {
  const byTitle = new Map();
  for (const film of films ?? []) {
    if (film?.title && !byTitle.has(film.title)) {
      byTitle.set(film.title, film);
    }
  }

  /** @type {string[]} */
  const missingTitles = [];
  /** @type {{ heading: string, description: string, items: { film: T, note: string | null }[] }[]} */
  const groups = [];

  for (const group of guide?.groups ?? []) {
    /** @type {{ film: T, note: string | null }[]} */
    const items = [];
    for (const entry of group.films ?? []) {
      const film = byTitle.get(entry.title);
      if (!film) {
        missingTitles.push(entry.title);
        continue;
      }
      const note = String(entry.note ?? "").trim();
      items.push({ film, note: note || null });
    }
    groups.push({
      heading: group.heading,
      description: group.description,
      items,
    });
  }

  if (missingTitles.length > 0) {
    return { groups: [], missingTitles };
  }

  return { groups, missingTitles };
}

/**
 * Exact title match only — never substitute a nearby film.
 *
 * @template {GuideFilmLike} T
 * @param {T[]} films
 * @param {string | null | undefined} title
 * @returns {T | null}
 */
export function findGuideFilmByTitle(films, title) {
  const exact = String(title ?? "").trim();
  if (!exact) {
    return null;
  }

  return (films ?? []).find((film) => film?.title === exact) ?? null;
}

/**
 * Resolve the guide's reference film (exact title). Missing is allowed:
 * the page still renders, without a hero poster.
 *
 * @template {GuideFilmLike} T
 * @param {GuidePageContent} guide
 * @param {T[]} films
 * @returns {T | null}
 */
export function resolveGuideAnchorFilm(guide, films) {
  return findGuideFilmByTitle(films, guide?.anchorTitle);
}
