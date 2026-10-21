import { ANNECY_2026_FEATURE_AWARDS } from "./annecy-2026-feature-awards.mjs";
import { OTTAWA_2026_FEATURE_AWARDS } from "./ottawa-2026-feature-awards.mjs";
import { ZAGREB_2026_FEATURE_AWARDS } from "./zagreb-2026-feature-awards.mjs";
import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_ANNECY_PATH,
  FESTIVALS_OTTAWA_PATH,
  FESTIVALS_ZAGREB_PATH,
} from "./public-festival-paths.mjs";

/**
 * Public festival award pages listed on /festivals.
 * Order is editorial — Annecy, Ottawa, Zagreb; add new majors here.
 * `coverTitle` is the catalog film whose poster represents the page on the index.
 */
export const PUBLIC_FESTIVAL_AWARD_LINKS = [
  {
    slug: ANNECY_2026_FEATURE_AWARDS.slug,
    href: FESTIVALS_ANNECY_PATH(CURRENT_FESTIVAL_YEAR),
    label: ANNECY_2026_FEATURE_AWARDS.h1,
    title: ANNECY_2026_FEATURE_AWARDS.h1,
    description: ANNECY_2026_FEATURE_AWARDS.intro[0],
    coverTitle: "The Violinist",
  },
  {
    slug: OTTAWA_2026_FEATURE_AWARDS.slug,
    href: FESTIVALS_OTTAWA_PATH(CURRENT_FESTIVAL_YEAR),
    label: OTTAWA_2026_FEATURE_AWARDS.h1,
    title: OTTAWA_2026_FEATURE_AWARDS.h1,
    description: OTTAWA_2026_FEATURE_AWARDS.intro[0],
    coverTitle: "We Are Aliens",
  },
  {
    slug: ZAGREB_2026_FEATURE_AWARDS.slug,
    href: FESTIVALS_ZAGREB_PATH(CURRENT_FESTIVAL_YEAR),
    label: ZAGREB_2026_FEATURE_AWARDS.h1,
    title: ZAGREB_2026_FEATURE_AWARDS.h1,
    description: ZAGREB_2026_FEATURE_AWARDS.intro[0],
    coverTitle: "Death Does Not Exist",
  },
];
