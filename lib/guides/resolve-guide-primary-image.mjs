import { getFilmPosterUrl } from "../film-poster.mjs";
import { findPublicFestivalAwardLinkBySlug } from "../festivals/public-festival-award-links.mjs";
import { findPublicGuideLinkBySlug } from "./public-guide-links.mjs";

/**
 * @param {string | null | undefined} left
 * @param {string | null | undefined} right
 */
function titlesMatch(left, right) {
  return String(left ?? "").trim() === String(right ?? "").trim();
}

/**
 * First catalog/short poster in on-page group order (prose/cards skipped).
 *
 * @param {{
 *   groups?: Array<{
 *     items?: Array<
 *       | { kind?: string, film?: { title?: string, poster_url?: string | null, image_url?: string | null } | null, posterUrl?: string | null, title?: string }
 *       | Record<string, unknown>
 *     >
 *   }>
 * }} page
 * @param {string | null | undefined} [matchTitle]
 * @returns {string | null}
 */
export function findGuidePosterInPageOrder(page, matchTitle = null) {
  const want = String(matchTitle ?? "").trim();
  for (const group of page?.groups ?? []) {
    for (const item of group.items ?? []) {
      if (
        !item ||
        item.kind === "prose" ||
        item.kind === "guidePreview" ||
        item.kind === "guideCard"
      ) {
        continue;
      }
      if (item.kind === "short") {
        const title = String(item.title ?? "").trim();
        if (!title) continue;
        if (want && !titlesMatch(title, want)) continue;
        const image = String(item.posterUrl ?? "").trim();
        if (image) return image;
        if (want) return null;
        continue;
      }
      const film = item.film;
      if (!film) continue;
      if (want && !titlesMatch(film.title, want)) continue;
      const image = getFilmPosterUrl(film);
      if (image) return image;
      if (want) return null;
    }
  }
  return null;
}

/**
 * Share / JSON-LD primary image for a guide or festival award page.
 *
 * Priority:
 * 1. explicit `seoImage` (dedicated SERP/share still under `public/`)
 * 2. static `coverPosterPath` (guide shorts / custom index cards)
 * 3. if `anchorFilm` → first on-page list poster (similar film)
 * 4. index / festival `coverTitle` poster
 * 5. first on-page list poster
 * 6. anchor poster (last resort)
 *
 * Index card cover (`coverTitle` / `coverPosterPath`) stays independent of
 * `seoImage` so “movies like X” can keep X on `/guides` while SERP uses a
 * chosen still.
 *
 * @param {{
 *   anchorFilm?: { title?: string, poster_url?: string | null, image_url?: string | null } | null,
 *   groups?: Array<{ items?: unknown[] }>
 * }} page
 * @param {{ slug?: string | null }} [options]
 * @returns {string | null}
 */
export function resolveGuidePrimaryImage(page, options = {}) {
  const slug = String(options.slug ?? "").trim();
  const guideLink = slug ? findPublicGuideLinkBySlug(slug) : null;
  const festivalLink = slug ? findPublicFestivalAwardLinkBySlug(slug) : null;

  const seoImage =
    typeof guideLink?.seoImage === "string" ? guideLink.seoImage.trim() : "";
  if (seoImage) {
    return seoImage;
  }

  const coverPosterPath =
    typeof guideLink?.coverPosterPath === "string"
      ? guideLink.coverPosterPath.trim()
      : "";
  if (coverPosterPath) {
    return coverPosterPath;
  }

  // “Movies like X”: index card stays X; SERP primary is a recommendation.
  if (page?.anchorFilm) {
    const firstListed = findGuidePosterInPageOrder(page);
    if (firstListed) return firstListed;
    return getFilmPosterUrl(page.anchorFilm);
  }

  const coverTitle =
    String(guideLink?.coverTitle ?? festivalLink?.coverTitle ?? "").trim() ||
    null;

  if (coverTitle) {
    const covered = findGuidePosterInPageOrder(page, coverTitle);
    if (covered) return covered;
  }

  return findGuidePosterInPageOrder(page);
}
