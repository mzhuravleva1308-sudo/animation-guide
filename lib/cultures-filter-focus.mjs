/**
 * Specific cultural binding for films tagged with quick_filters "cultures".
 * Prefer concrete place + social texture over continent-level labels.
 *
 * Keys are exact films.title values. Only 🟢 keep-set titles belong here.
 */

export const CULTURES_FILTER_FOCUS = Object.freeze({
  "Bombay Rose":
    "India — Mumbai urban life: migration, poverty, faith, family duty",
  "The Tower":
    "Palestine — refugee-camp family memory and identity",
  Savages: "Borneo — Penan indigenous life, forest, and its destruction",
  "The Rabbi's Cat":
    "Algeria — Maghrebi Jewish life in colonial Algiers",
  "My Sunny Maad":
    "Afghanistan — family life, marriage, gender roles (specific household/period)",
  "Aya of Yop City":
    "Côte d'Ivoire — 1970s Abidjan / Yopougon everyday urban life",
  "Window Horses":
    "Iran — poetry, arts, and cultural encounter via researched outsider gaze",
  "The Last Fiction":
    "Ancient Persia — Shahnameh mythology and literary heritage (folklore, not modern life)",
  "Virus Tropical":
    "Colombia / Ecuador — autobiographical family, upbringing, social norms",
  Persepolis: "Iran — family life, post-revolution society, and exile",
  "Have a Nice Day":
    "China — contemporary social/economic underworld texture (not typical everyday China)",
});

/**
 * @param {string | null | undefined} title
 * @returns {string | null}
 */
export function getCulturesFilterFocus(title) {
  if (typeof title !== "string" || !title) return null;
  return CULTURES_FILTER_FOCUS[title] ?? null;
}
