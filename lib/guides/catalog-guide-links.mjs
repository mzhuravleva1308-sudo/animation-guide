import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";

const CATALOG_GUIDE_LINKS = [
  {
    filmTitle: FILMS_LIKE_FLOW_GUIDE.anchorTitle,
    href: `/guides/${FILMS_LIKE_FLOW_GUIDE.slug}`,
    label: FILMS_LIKE_FLOW_GUIDE.h1,
  },
];

/**
 * In-catalog link from a film card to an editorial guide.
 * Exact title only — never substitute.
 *
 * @param {string | null | undefined} filmTitle
 * @returns {{ href: string, label: string } | null}
 */
export function getCatalogGuideLink(filmTitle) {
  if (!filmTitle) {
    return null;
  }
  const match = CATALOG_GUIDE_LINKS.find((link) => link.filmTitle === filmTitle);
  if (!match) {
    return null;
  }
  return { href: match.href, label: match.label };
}
