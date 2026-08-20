import { ANIMATION_STYLES_GUIDE } from "./animation-styles.mjs";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { WEIRD_ANIMATED_MOVIES_GUIDE } from "./weird-animated-movies.mjs";

export const GUIDES_INDEX_PATH = "/guides";

/**
 * Public editorial guides listed on /guides.
 * Order is editorial — Flow first, then beauty, then weird, then styles.
 */
export const PUBLIC_GUIDE_LINKS = [
  {
    slug: FILMS_LIKE_FLOW_GUIDE.slug,
    href: `/guides/${FILMS_LIKE_FLOW_GUIDE.slug}`,
    label: "9 Movies Like Flow",
    title: FILMS_LIKE_FLOW_GUIDE.h1,
    description: FILMS_LIKE_FLOW_GUIDE.intro[0],
  },
  {
    slug: BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug,
    href: `/guides/${BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug}`,
    label: "Beautiful animated films",
    title: BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1,
    description: BEAUTIFUL_ANIMATED_FILMS_GUIDE.intro[0],
  },
  {
    slug: WEIRD_ANIMATED_MOVIES_GUIDE.slug,
    href: `/guides/${WEIRD_ANIMATED_MOVIES_GUIDE.slug}`,
    label: "Weird animated movies",
    title: WEIRD_ANIMATED_MOVIES_GUIDE.h1,
    description: WEIRD_ANIMATED_MOVIES_GUIDE.intro[0],
  },
  {
    slug: ANIMATION_STYLES_GUIDE.slug,
    href: `/guides/${ANIMATION_STYLES_GUIDE.slug}`,
    label: "Animation styles",
    title: ANIMATION_STYLES_GUIDE.h1,
    description: ANIMATION_STYLES_GUIDE.intro[0],
  },
];
