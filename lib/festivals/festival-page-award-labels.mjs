/**
 * Primary award short-labels for festival badges, sourced only from published
 * Resonale feature-award pages (not arbitrary DB recognitions).
 */
import { ANNECY_2022_FEATURE_AWARDS } from "./annecy-2022-feature-awards.mjs";
import { ANNECY_2023_FEATURE_AWARDS } from "./annecy-2023-feature-awards.mjs";
import { ANNECY_2024_FEATURE_AWARDS } from "./annecy-2024-feature-awards.mjs";
import { ANNECY_2025_FEATURE_AWARDS } from "./annecy-2025-feature-awards.mjs";
import { ANNECY_2026_FEATURE_AWARDS } from "./annecy-2026-feature-awards.mjs";
import { OTTAWA_2026_FEATURE_AWARDS } from "./ottawa-2026-feature-awards.mjs";
import { STUTTGART_2026_FEATURE_AWARDS } from "./stuttgart-2026-feature-awards.mjs";
import { ZAGREB_2026_FEATURE_AWARDS } from "./zagreb-2026-feature-awards.mjs";

/** @type {ReadonlyArray<import("../guides/resolve-guide-films.mjs").GuidePageContent>} */
const FEATURE_AWARD_PAGES = [
  ANNECY_2026_FEATURE_AWARDS,
  ANNECY_2025_FEATURE_AWARDS,
  ANNECY_2024_FEATURE_AWARDS,
  ANNECY_2023_FEATURE_AWARDS,
  ANNECY_2022_FEATURE_AWARDS,
  OTTAWA_2026_FEATURE_AWARDS,
  ZAGREB_2026_FEATURE_AWARDS,
  STUTTGART_2026_FEATURE_AWARDS,
];

/** Slugs on feature-award pages that map 1:1 to FestivalBadgeId. */
const PAGE_SLUG_TO_BADGE_ID = new Map([
  ["annecy", "annecy"],
  ["ottawa", "ottawa"],
  ["zagreb", "zagreb"],
  ["stuttgart", "stuttgart"],
]);

/**
 * Long page-note primaries → short badge text.
 * Unknown notes pass through unchanged.
 * @type {ReadonlyMap<string, string>}
 */
export const FESTIVAL_PAGE_AWARD_SHORT_LABELS = new Map([
  ["Cristal for a Feature Film", "Cristal"],
  ["Paul Grimault Award", "Paul Grimault"],
  ["Gan Foundation Award for Distribution", "Gan Foundation"],
  ["Grand Prize for Animated Feature", "Grand Prize"],
  ["Grand Prix — Best Feature Film", "Grand Prix"],
  ["Mr. M Audience Award for Best Feature Film", "Audience Award"],
  ["AniMovie Award — Best Animated Feature Film", "AniMovie Award"],
]);

/**
 * First award segment from a page note (pages list the main prize first).
 * @param {string | null | undefined} note
 * @returns {string | null}
 */
export function primaryAwardNote(note) {
  const trimmed = String(note ?? "").trim();
  if (!trimmed) {
    return null;
  }
  const primary = trimmed.split(/\s*·\s*/)[0]?.trim() ?? "";
  return primary.length > 0 ? primary : null;
}

/**
 * @param {string | null | undefined} primaryNote
 * @returns {string | null}
 */
export function shortFestivalAwardLabel(primaryNote) {
  const primary = primaryAwardNote(primaryNote);
  if (!primary) {
    return null;
  }
  return FESTIVAL_PAGE_AWARD_SHORT_LABELS.get(primary) ?? primary;
}

/**
 * title → (badgeId → short award label)
 * Newer pages are registered first; an existing title+badge keeps the first award.
 * @type {Map<string, Map<string, string>>}
 */
const AWARDS_BY_TITLE = new Map();

for (const page of FEATURE_AWARD_PAGES) {
  const badgeId = PAGE_SLUG_TO_BADGE_ID.get(page.slug);
  if (!badgeId) {
    continue;
  }
  for (const group of page.groups ?? []) {
    for (const film of group.films ?? []) {
      const title = String(film?.title ?? "").trim();
      const award = shortFestivalAwardLabel(film?.note);
      if (!title || !award) {
        continue;
      }
      let byBadge = AWARDS_BY_TITLE.get(title);
      if (!byBadge) {
        byBadge = new Map();
        AWARDS_BY_TITLE.set(title, byBadge);
      }
      if (!byBadge.has(badgeId)) {
        byBadge.set(badgeId, award);
      }
    }
  }
}

/**
 * @param {string | null | undefined} title
 * @param {string | null | undefined} badgeId
 * @returns {string | null}
 */
export function getFestivalPageAwardLabel(title, badgeId) {
  const normalizedTitle = String(title ?? "").trim();
  const normalizedBadgeId = String(badgeId ?? "").trim();
  if (!normalizedTitle || !normalizedBadgeId) {
    return null;
  }
  return AWARDS_BY_TITLE.get(normalizedTitle)?.get(normalizedBadgeId) ?? null;
}

/**
 * Compose festival badge labels with page-sourced primary awards.
 * @param {Array<{ id: string, label: string }>} badges
 * @param {string | null | undefined} filmTitle
 * @returns {typeof badges}
 */
export function applyFestivalPageAwardLabels(badges, filmTitle) {
  return badges.map((badge) => {
    const award = getFestivalPageAwardLabel(filmTitle, badge.id);
    if (!award) {
      return badge;
    }
    return {
      ...badge,
      label: `${badge.label} · ${award}`,
    };
  });
}
