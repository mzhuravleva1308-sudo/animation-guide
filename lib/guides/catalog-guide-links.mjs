import { ANIMATION_STYLES_GUIDE } from "./animation-styles.mjs";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { WEIRD_ANIMATED_MOVIES_GUIDE } from "./weird-animated-movies.mjs";
import { listGuideFilmTitles } from "./resolve-guide-films.mjs";

const CATALOG_GUIDE_LINKS = [
  {
    filmTitle: FILMS_LIKE_FLOW_GUIDE.anchorTitle,
    href: `/guides/${FILMS_LIKE_FLOW_GUIDE.slug}`,
    label: "9 Movies Like Flow",
  },
  ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE).map((filmTitle) => ({
    filmTitle,
    href: `/guides/${BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug}`,
    label: "Beautiful animated films",
  })),
  ...listGuideFilmTitles(WEIRD_ANIMATED_MOVIES_GUIDE).map((filmTitle) => ({
    filmTitle,
    href: `/guides/${WEIRD_ANIMATED_MOVIES_GUIDE.slug}`,
    label: "Weird animated movies",
  })),
  ...listGuideFilmTitles(ANIMATION_STYLES_GUIDE).map((filmTitle) => ({
    filmTitle,
    href: `/guides/${ANIMATION_STYLES_GUIDE.slug}`,
    label: "Animation styles",
  })),
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
