import { ANNECY_2022_FEATURE_AWARDS } from "../festivals/annecy-2022-feature-awards.mjs";
import { ANNECY_2023_FEATURE_AWARDS } from "../festivals/annecy-2023-feature-awards.mjs";
import { ANNECY_2024_FEATURE_AWARDS } from "../festivals/annecy-2024-feature-awards.mjs";
import { ANNECY_2025_FEATURE_AWARDS } from "../festivals/annecy-2025-feature-awards.mjs";
import { ANNECY_2026_FEATURE_AWARDS } from "../festivals/annecy-2026-feature-awards.mjs";
import { OTTAWA_2026_FEATURE_AWARDS } from "../festivals/ottawa-2026-feature-awards.mjs";
import { STUTTGART_2026_FEATURE_AWARDS } from "../festivals/stuttgart-2026-feature-awards.mjs";
import { ZAGREB_2026_FEATURE_AWARDS } from "../festivals/zagreb-2026-feature-awards.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_ANNECY_PATH,
  FESTIVALS_OTTAWA_PATH,
  FESTIVALS_STUTTGART_PATH,
  FESTIVALS_ZAGREB_PATH,
} from "../festivals/public-festival-paths.mjs";
import { ADAM_ELLIOT_MOVIES_GUIDE } from "./adam-elliot-movies.mjs";
import { ANIMATION_STYLES_GUIDE } from "./animation-styles.mjs";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE } from "./best-animated-movies-for-adults.mjs";
import { BEST_STOP_MOTION_MOVIES_GUIDE } from "./best-stop-motion-movies.mjs";
import { CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE } from "./christmas-new-year-animated-films.mjs";
import { FILMS_LIKE_CORALINE_GUIDE } from "./films-like-coraline.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { FILMS_LIKE_SPIRITED_AWAY_GUIDE } from "./films-like-spirited-away.mjs";
import { INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE } from "./indie-animated-movies-beyond-studios.mjs";
import { STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE } from "./strange-festival-animated-movies.mjs";
import { TOMM_MOORE_MOVIES_GUIDE } from "./tomm-moore-movies.mjs";
import { listGuideFilmTitles } from "./resolve-guide-films.mjs";

const ANNECY_2026_HREF = FESTIVALS_ANNECY_PATH(CURRENT_FESTIVAL_YEAR);
const ANNECY_2025_HREF = FESTIVALS_ANNECY_PATH(2025);
const ANNECY_2024_HREF = FESTIVALS_ANNECY_PATH(2024);
const ANNECY_2023_HREF = FESTIVALS_ANNECY_PATH(2023);
const ANNECY_2022_HREF = FESTIVALS_ANNECY_PATH(2022);
const OTTAWA_2026_HREF = FESTIVALS_OTTAWA_PATH(CURRENT_FESTIVAL_YEAR);
const ZAGREB_2026_HREF = FESTIVALS_ZAGREB_PATH(CURRENT_FESTIVAL_YEAR);
const STUTTGART_2026_HREF = FESTIVALS_STUTTGART_PATH(CURRENT_FESTIVAL_YEAR);

const FLOW_GUIDE_HREF = `/guides/${FILMS_LIKE_FLOW_GUIDE.slug}`;
const FLOW_GUIDE_LABEL = "9 Movies Like Flow";
const CORALINE_GUIDE_HREF = `/guides/${FILMS_LIKE_CORALINE_GUIDE.slug}`;
const CORALINE_GUIDE_LABEL = "9 Movies Like Coraline";
const SPIRITED_AWAY_GUIDE_HREF = `/guides/${FILMS_LIKE_SPIRITED_AWAY_GUIDE.slug}`;
const SPIRITED_AWAY_GUIDE_LABEL = "9 Movies Like Spirited Away";

/**
 * Titles that already link via the director name. Skip thematic "in …" chips
 * for them so festival pages (e.g. Annecy) can still surface when applicable.
 */
const DIRECTOR_FILMOGRAPHY_CATALOG_TITLES = new Set([
  ...listGuideFilmTitles(ADAM_ELLIOT_MOVIES_GUIDE),
  ...listGuideFilmTitles(TOMM_MOORE_MOVIES_GUIDE),
]);

/** Directed by others; Moore’s key role still links the film card to his guide. */
const TOMM_MOORE_KEY_ROLE_CATALOG_TITLES = [
  "The Prophet",
  "The Breadwinner",
  "My Father's Dragon",
];

const CATALOG_GUIDE_LINKS = [
  {
    filmTitle: FILMS_LIKE_SPIRITED_AWAY_GUIDE.anchorTitle,
    href: SPIRITED_AWAY_GUIDE_HREF,
    label: SPIRITED_AWAY_GUIDE_LABEL,
  },
  ...listGuideFilmTitles(FILMS_LIKE_SPIRITED_AWAY_GUIDE).map((filmTitle) => ({
    filmTitle,
    href: SPIRITED_AWAY_GUIDE_HREF,
    label: SPIRITED_AWAY_GUIDE_LABEL,
  })),
  {
    filmTitle: FILMS_LIKE_FLOW_GUIDE.anchorTitle,
    href: FLOW_GUIDE_HREF,
    label: FLOW_GUIDE_LABEL,
  },
  ...listGuideFilmTitles(FILMS_LIKE_FLOW_GUIDE).map((filmTitle) => ({
    filmTitle,
    href: FLOW_GUIDE_HREF,
    label: FLOW_GUIDE_LABEL,
  })),
  {
    filmTitle: FILMS_LIKE_CORALINE_GUIDE.anchorTitle,
    href: CORALINE_GUIDE_HREF,
    label: CORALINE_GUIDE_LABEL,
  },
  ...listGuideFilmTitles(FILMS_LIKE_CORALINE_GUIDE).map((filmTitle) => ({
    filmTitle,
    href: CORALINE_GUIDE_HREF,
    label: CORALINE_GUIDE_LABEL,
  })),
  ...TOMM_MOORE_KEY_ROLE_CATALOG_TITLES.map((filmTitle) => ({
    filmTitle,
    href: `/guides/${TOMM_MOORE_MOVIES_GUIDE.slug}`,
    label: "Tomm Moore movies",
  })),
  ...listGuideFilmTitles(BEAUTIFUL_ANIMATED_FILMS_GUIDE).map((filmTitle) => ({
    filmTitle,
    href: `/guides/${BEAUTIFUL_ANIMATED_FILMS_GUIDE.slug}`,
    label: "Beautiful animated films",
  })),
  ...listGuideFilmTitles(STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE).map(
    (filmTitle) => ({
      filmTitle,
      href: `/guides/${STRANGE_FESTIVAL_ANIMATED_MOVIES_GUIDE.slug}`,
      label: "Strange festival animated movies",
    })
  ),
  ...listGuideFilmTitles(ANIMATION_STYLES_GUIDE)
    .filter((filmTitle) => !DIRECTOR_FILMOGRAPHY_CATALOG_TITLES.has(filmTitle))
    .map((filmTitle) => ({
      filmTitle,
      href: `/guides/${ANIMATION_STYLES_GUIDE.slug}`,
      label: "Animation styles",
    })),
  ...listGuideFilmTitles(INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE)
    .filter((filmTitle) => !DIRECTOR_FILMOGRAPHY_CATALOG_TITLES.has(filmTitle))
    .map((filmTitle) => ({
      filmTitle,
      href: `/guides/${INDIE_ANIMATED_MOVIES_BEYOND_STUDIOS_GUIDE.slug}`,
      label: "Indie animated movies beyond the studios",
    })),
  ...listGuideFilmTitles(CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE).map(
    (filmTitle) => ({
      filmTitle,
      href: `/guides/${CHRISTMAS_NEW_YEAR_ANIMATED_FILMS_GUIDE.slug}`,
      label: "Winter Magic: Animated Films for Grown-Ups",
    })
  ),
  ...listGuideFilmTitles(BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE).map(
    (filmTitle) => ({
      filmTitle,
      href: `/guides/${BEST_ANIMATED_MOVIES_FOR_ADULTS_GUIDE.slug}`,
      label: "Best animated movies for adults",
    })
  ),
  // After styles / indie so shared titles (No Dogs, Anomalisa) keep those chips.
  ...listGuideFilmTitles(BEST_STOP_MOTION_MOVIES_GUIDE).map((filmTitle) => ({
    filmTitle,
    href: `/guides/${BEST_STOP_MOTION_MOVIES_GUIDE.slug}`,
    label: "Best stop motion movies",
  })),
  ...listGuideFilmTitles(ANNECY_2026_FEATURE_AWARDS).map((filmTitle) => ({
    filmTitle,
    href: ANNECY_2026_HREF,
    label: ANNECY_2026_FEATURE_AWARDS.h1,
  })),
  ...listGuideFilmTitles(ANNECY_2025_FEATURE_AWARDS).map((filmTitle) => ({
    filmTitle,
    href: ANNECY_2025_HREF,
    label: ANNECY_2025_FEATURE_AWARDS.h1,
  })),
  ...listGuideFilmTitles(ANNECY_2024_FEATURE_AWARDS).map((filmTitle) => ({
    filmTitle,
    href: ANNECY_2024_HREF,
    label: ANNECY_2024_FEATURE_AWARDS.h1,
  })),
  ...listGuideFilmTitles(ANNECY_2023_FEATURE_AWARDS).map((filmTitle) => ({
    filmTitle,
    href: ANNECY_2023_HREF,
    label: ANNECY_2023_FEATURE_AWARDS.h1,
  })),
  ...listGuideFilmTitles(ANNECY_2022_FEATURE_AWARDS).map((filmTitle) => ({
    filmTitle,
    href: ANNECY_2022_HREF,
    label: ANNECY_2022_FEATURE_AWARDS.h1,
  })),
  ...listGuideFilmTitles(OTTAWA_2026_FEATURE_AWARDS).map((filmTitle) => ({
    filmTitle,
    href: OTTAWA_2026_HREF,
    label: OTTAWA_2026_FEATURE_AWARDS.h1,
  })),
  ...listGuideFilmTitles(ZAGREB_2026_FEATURE_AWARDS).map((filmTitle) => ({
    filmTitle,
    href: ZAGREB_2026_HREF,
    label: ZAGREB_2026_FEATURE_AWARDS.h1,
  })),
  ...listGuideFilmTitles(STUTTGART_2026_FEATURE_AWARDS).map((filmTitle) => ({
    filmTitle,
    href: STUTTGART_2026_HREF,
    label: STUTTGART_2026_FEATURE_AWARDS.h1,
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

/** Exact single director name → director filmography guide. */
const CATALOG_DIRECTOR_GUIDE_LINKS = [
  {
    director: "Adam Elliot",
    href: `/guides/${ADAM_ELLIOT_MOVIES_GUIDE.slug}`,
    label: "Adam Elliot movies",
  },
  {
    director: "Tomm Moore",
    href: `/guides/${TOMM_MOORE_MOVIES_GUIDE.slug}`,
    label: "Tomm Moore movies",
  },
];

/**
 * In-catalog link from a single director name to a director guide.
 * Exact one-name match only — never substitute, never match a full credit string.
 *
 * @param {string | null | undefined} director
 * @returns {{ href: string, label: string } | null}
 */
export function getCatalogDirectorGuideLink(director) {
  if (!director) {
    return null;
  }
  const match = CATALOG_DIRECTOR_GUIDE_LINKS.find(
    (link) => link.director === director
  );
  if (!match) {
    return null;
  }
  return { href: match.href, label: match.label };
}

/**
 * Split a film credit like "Tomm Moore, Nora Twomey" into linked / plain names.
 * Only exact single-name guide matches become links (co-directors stay plain).
 *
 * @param {string | null | undefined} directorCredit
 * @param {string | null | undefined} [currentGuidePath]
 * @returns {{ name: string, href: string | null, label: string | null }[]}
 */
export function listCatalogDirectorCreditParts(
  directorCredit,
  currentGuidePath = null
) {
  const credit = String(directorCredit ?? "").trim();
  if (!credit) {
    return [];
  }
  return credit.split(/\s*,\s*/).map((name) => {
    const link = getCatalogDirectorGuideLink(name);
    const href =
      link && link.href !== currentGuidePath ? link.href : null;
    return {
      name,
      href,
      label: href ? link.label : null,
    };
  });
}
