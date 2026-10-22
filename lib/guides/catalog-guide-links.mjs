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
import { ANIMATION_STYLES_GUIDE } from "./animation-styles.mjs";
import { BEAUTIFUL_ANIMATED_FILMS_GUIDE } from "./beautiful-animated-films.mjs";
import { FILMS_LIKE_FLOW_GUIDE } from "./films-like-flow.mjs";
import { NON_DISNEY_ANIMATED_MOVIES_GUIDE } from "./non-disney-animated-movies.mjs";
import { WEIRD_ANIMATED_MOVIES_GUIDE } from "./weird-animated-movies.mjs";
import { listGuideFilmTitles } from "./resolve-guide-films.mjs";

const ANNECY_2026_HREF = FESTIVALS_ANNECY_PATH(CURRENT_FESTIVAL_YEAR);
const ANNECY_2025_HREF = FESTIVALS_ANNECY_PATH(2025);
const ANNECY_2024_HREF = FESTIVALS_ANNECY_PATH(2024);
const ANNECY_2023_HREF = FESTIVALS_ANNECY_PATH(2023);
const ANNECY_2022_HREF = FESTIVALS_ANNECY_PATH(2022);
const OTTAWA_2026_HREF = FESTIVALS_OTTAWA_PATH(CURRENT_FESTIVAL_YEAR);
const ZAGREB_2026_HREF = FESTIVALS_ZAGREB_PATH(CURRENT_FESTIVAL_YEAR);
const STUTTGART_2026_HREF = FESTIVALS_STUTTGART_PATH(CURRENT_FESTIVAL_YEAR);

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
  ...listGuideFilmTitles(NON_DISNEY_ANIMATED_MOVIES_GUIDE).map((filmTitle) => ({
    filmTitle,
    href: `/guides/${NON_DISNEY_ANIMATED_MOVIES_GUIDE.slug}`,
    label: "Non-Disney animated movies",
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
