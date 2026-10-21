import {
  CURRENT_FESTIVAL_YEAR,
  FESTIVALS_ANNECY_PATH,
  FESTIVALS_OTTAWA_PATH,
  FESTIVALS_YEAR_PATH,
} from "./festivals/public-festival-paths.mjs";
import { GUIDES_INDEX_PATH, PUBLIC_GUIDE_LINKS } from "./guides/public-guide-links.mjs";

/**
 * Canonical public paths listed in sitemap.xml.
 * Guide article URLs always come from PUBLIC_GUIDE_LINKS so a new guide
 * cannot ship without a sitemap entry.
 * Legal pages (`/privacy`, `/contact`) stay off the sitemap and send noindex.
 */
export const PUBLIC_SITEMAP_PATHS = [
  "/",
  GUIDES_INDEX_PATH,
  ...PUBLIC_GUIDE_LINKS.map((guide) => guide.href),
  FESTIVALS_YEAR_PATH(CURRENT_FESTIVAL_YEAR),
  FESTIVALS_ANNECY_PATH(CURRENT_FESTIVAL_YEAR),
  FESTIVALS_OTTAWA_PATH(CURRENT_FESTIVAL_YEAR),
];
