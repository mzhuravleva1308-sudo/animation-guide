import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";

export const GUIDES_INDEX_PATH = "/guides";

/**
 * Public editorial guides listed on /guides.
 * Order is editorial — Flow guide first, then the beauty roundup.
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
];
