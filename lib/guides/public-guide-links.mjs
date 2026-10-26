import { ANIMATION_STYLES_GUIDE } from "./animation-styles.mjs";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE } from "./indie-animated-movies-beyond-studios.mjs";
import { STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE } from "./strange-festival-animated-movies.mjs";

export const GUIDES_INDEX_PATH = "/guides";

/**
 * Public editorial guides listed on /guides.
 * Order is editorial — Flow first, then beauty, then strange festival, then styles,
 * then indie beyond studios.
 * `coverTitle` is the catalog film whose poster represents the guide on the index.
 */
export const PUBLIC_GUIDE_LINKS = [
  {
    slug: FILMS_LIKE_FLOW_GUIDE.slug,
    href: `/guides/${FILMS_LIKE_FLOW_GUIDE.slug}`,
    label: "9 Movies Like Flow",
    title: FILMS_LIKE_FLOW_GUIDE.h1,
    description: FILMS_LIKE_FLOW_GUIDE.intro[0],
    coverTitle: "Flow",
  },
  {
    slug: BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug,
    href: `/guides/${BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug}`,
    label: "Beautiful animated films",
    title: BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1,
    description: BEAUTIFUL_ANIMATED_FILMS_GUIDE.intro[0],
    coverTitle: "Arco",
  },
  {
    slug: STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.slug,
    href: `/guides/${STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.slug}`,
    label: "Strange festival animated movies",
    title: STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.h1,
    description: STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.intro[0],
    coverTitle: "Nobody",
  },
  {
    slug: ANIMATION_STYLES_GUIDE.slug,
    href: `/guides/${ANIMATION_STYLES_GUIDE.slug}`,
    label: "Animation styles",
    title: ANIMATION_STYLES_GUIDE.h1,
    description: ANIMATION_STYLES_GUIDE.intro[0],
    coverTitle: "Fantastic Planet",
  },
  {
    slug: INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.slug,
    href: `/guides/${INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.slug}`,
    label: "Indie animated movies beyond the studios",
    title: INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1,
    description: INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.intro[0],
    coverTitle: "The Painting",
  },
];
