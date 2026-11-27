import { ADAM_ELLIOT_MOVIES_GUIDE } from "./adam-elliot-movies.mjs";
import { ANIMATION_STYLES_GUIDE } from "./animation-styles.mjs";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE } from "./best-animated-movies-for-adults.mjs";
import { BEST_STOP_MOTION_MOVIES_GUIDE } from "./best-stop-motion-movies.mjs";
import { CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE } from "./christmas-new-year-animated-films.mjs";
import { CLAY_ANIMATION_MOVIES_GUIDE } from "./clay-animation-movies.mjs";
import { FILMS_LIKE_CORALINE_GUIDE } from "./films-like-coraline.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { FILMS_LIKE_SPIRITED_AWAY_GUIDE } from "./films-like-spirited-away.mjs";
import { INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE } from "./indie-animated-movies-beyond-studios.mjs";
import { STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE } from "./strange-festival-animated-movies.mjs";
import { TOMM_MOORE_MOVIES_GUIDE } from "./tomm-moore-movies.mjs";

export const GUIDES_INDEX_PATH = "/guides";

/**
 * @typedef {{
 *   slug: string,
 *   href: string,
 *   label: string,
 *   title: string,
 *   description: string,
 *   coverTitle: string,
 *   coverPosterPath?: string,
 *   seoImage?: string,
 *   pinned?: boolean,
 *   publishedAt: string,
 *   updatedAt: string,
 * }} PublicGuideLink
 */

/**
 * Public editorial guides listed on /guides.
 * Pinned meta-guides first, then `publishedAt` descending (newest first).
 * `coverTitle` labels the guides-index card cover. Prefer a catalog feature
 * poster via `loadGuideCoverFilms`. For guide shorts (never catalog), set
 * `coverPosterPath` to a static file under `public/` (see guides-shorts-not-catalog).
 *
 * Optional `seoImage` is a site-relative path under `public/` used only for
 * `og:image` / `twitter:image` / JSON-LD `primaryImageOfPage` + `image`
 * (independent of the index card and of the first listed film).
 * Without `seoImage`, `resolveGuidePrimaryImage` falls back to cover / list logic.
 * `publishedAt` / `updatedAt` are YYYY-MM-DD editorial dates.
 *
 * WIP drafts stay in lib/guides but are not listed here until ready to publish.
 */
/** @type {PublicGuideLink[]} */
const PUBLIC_GUIDE_LINK_DEFS = [
  {
    slug: CLAY_ANIMATION_MOVIES_GUIDE.slug,
    href: `/guides/${CLAY_ANIMATION_MOVIES_GUIDE.slug}`,
    label: "Clay Animation Movies",
    title: CLAY_ANIMATION_MOVIES_GUIDE.h1,
    description: CLAY_ANIMATION_MOVIES_GUIDE.intro[0],
    coverTitle: "Creature Comforts",
    // Short — not a catalog film; static guide poster only.
    coverPosterPath: "/guides/clay-animation-movies/creature-comforts-cover.jpg",
    publishedAt: "2026-11-22",
    updatedAt: "2026-11-24",
  },
  {
    slug: BEST_STOP_MOTION_MOVIES_GUIDE.slug,
    href: `/guides/${BEST_STOP_MOTION_MOVIES_GUIDE.slug}`,
    label: "Best stop motion movies",
    title: BEST_STOP_MOTION_MOVIES_GUIDE.h1,
    description: BEST_STOP_MOTION_MOVIES_GUIDE.intro[0],
    coverTitle: "No Dogs or Italians Allowed",
    publishedAt: "2026-11-21",
    updatedAt: "2026-11-24",
  },
  {
    slug: BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.slug,
    href: `/guides/${BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.slug}`,
    label: "Best animated movies for adults",
    title: BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.h1,
    description: BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.intro[0],
    coverTitle: "Mars Express",
    // Square SERP/share still — Mars Express (same subject as index cover).
    seoImage: "/guides/best-animated-movies-for-adults/seo.jpg",
    publishedAt: "2026-11-20",
    updatedAt: "2026-11-21",
  },
  {
    slug: TOMM_MOORE_MOVIES_GUIDE.slug,
    href: `/guides/${TOMM_MOORE_MOVIES_GUIDE.slug}`,
    label: "Tomm Moore movies",
    title: TOMM_MOORE_MOVIES_GUIDE.h1,
    description: TOMM_MOORE_MOVIES_GUIDE.intro[0],
    coverTitle: "Wolfwalkers",
    publishedAt: "2026-11-18",
    updatedAt: "2026-11-20",
  },
  {
    slug: CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.slug,
    href: `/guides/${CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.slug}`,
    label: "Winter Magic: Animated Films for Grown-Ups",
    title: CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.h1,
    description: CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.intro[0],
    coverTitle: "Tony, Shelly and the Magic Light",
    publishedAt: "2026-11-17",
    updatedAt: "2026-11-17",
  },
  {
    slug: FILMS_LIKE_SPIRITED_AWAY_GUIDE.slug,
    href: `/guides/${FILMS_LIKE_SPIRITED_AWAY_GUIDE.slug}`,
    label: "9 Movies Like Spirited Away",
    title: FILMS_LIKE_SPIRITED_AWAY_GUIDE.h1,
    description: FILMS_LIKE_SPIRITED_AWAY_GUIDE.intro[0],
    coverTitle: "Spirited Away",
    // Square SERP/share still — not the index card, not first list poster.
    seoImage: "/guides/films-like-spirited-away/seo.jpg",
    publishedAt: "2026-11-15",
    updatedAt: "2026-11-15",
  },
  {
    slug: FILMS_LIKE_FLOW_GUIDE.slug,
    href: `/guides/${FILMS_LIKE_FLOW_GUIDE.slug}`,
    label: "9 Movies Like Flow",
    title: FILMS_LIKE_FLOW_GUIDE.h1,
    description: FILMS_LIKE_FLOW_GUIDE.intro[0],
    coverTitle: "Flow",
    // Square SERP/share still — not the index card, not first list poster.
    seoImage: "/guides/films-like-flow/seo.jpg",
    publishedAt: "2026-08-17",
    updatedAt: "2026-11-11",
  },
  {
    // Same calendar day as Beautiful; listed first so stable sort keeps it newer.
    slug: STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.slug,
    href: `/guides/${STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.slug}`,
    label: "Strange festival animated movies",
    title: STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.h1,
    description: STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.intro[0],
    coverTitle: "Nobody",
    publishedAt: "2026-08-18",
    updatedAt: "2026-11-05",
  },
  {
    slug: BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug,
    href: `/guides/${BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug}`,
    label: "Beautiful animated films",
    title: BEAUTIFUL_ANIMATED_FILMS_GUIDE.h1,
    description: BEAUTIFUL_ANIMATED_FILMS_GUIDE.intro[0],
    coverTitle: "Arco",
    publishedAt: "2026-08-18",
    updatedAt: "2026-11-05",
  },
  {
    slug: ANIMATION_STYLES_GUIDE.slug,
    href: `/guides/${ANIMATION_STYLES_GUIDE.slug}`,
    label: "Animation styles",
    title: ANIMATION_STYLES_GUIDE.h1,
    description: ANIMATION_STYLES_GUIDE.intro[0],
    coverTitle: "Fantastic Planet",
    publishedAt: "2026-08-20",
    updatedAt: "2026-11-24",
  },
  {
    slug: INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.slug,
    href: `/guides/${INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.slug}`,
    label: "Indie animated movies beyond the studios",
    title: INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.h1,
    description: INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.intro[0],
    coverTitle: "The Painting",
    publishedAt: "2026-08-21",
    updatedAt: "2026-11-18",
  },
  {
    slug: FILMS_LIKE_CORALINE_GUIDE.slug,
    href: `/guides/${FILMS_LIKE_CORALINE_GUIDE.slug}`,
    label: "9 Movies Like Coraline",
    title: FILMS_LIKE_CORALINE_GUIDE.h1,
    description: FILMS_LIKE_CORALINE_GUIDE.intro[0],
    coverTitle: "Coraline",
    // Square SERP/share still — not the index card, not first list poster.
    seoImage: "/guides/films-like-coraline/seo.jpg",
    publishedAt: "2026-11-05",
    updatedAt: "2026-11-11",
  },
  {
    slug: ADAM_ELLIOT_MOVIES_GUIDE.slug,
    href: `/guides/${ADAM_ELLIOT_MOVIES_GUIDE.slug}`,
    label: "Adam Elliot movies",
    title: ADAM_ELLIOT_MOVIES_GUIDE.h1,
    description: ADAM_ELLIOT_MOVIES_GUIDE.intro[0],
    coverTitle: "Mary and Max",
    publishedAt: "2026-11-07",
    updatedAt: "2026-11-07",
  },
];

/** @type {PublicGuideLink[]} */
export const PUBLIC_GUIDE_LINKS = [...PUBLIC_GUIDE_LINK_DEFS].sort((a, b) => {
  const pinnedDelta = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
  if (pinnedDelta !== 0) {
    return pinnedDelta;
  }
  return a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0;
});

/**
 * @param {string | null | undefined} slug
 * @returns {(typeof PUBLIC_GUIDE_LINKS)[number] | null}
 */
export function findPublicGuideLinkBySlug(slug) {
  const exact = String(slug ?? "").trim();
  if (!exact) {
    return null;
  }
  return PUBLIC_GUIDE_LINKS.find((guide) => guide.slug === exact) ?? null;
}
