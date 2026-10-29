/**
 * Festival options behind the Award winners quick filter.
 * Only Resonale-major festivals we badge; menus keep those with >10 catalog films.
 */

/**
 * @typedef {"annecy" | "ottawa" | "zagreb" | "stuttgart" | "cannes" | "tiff" | "berlinale" | "sundance" | "venice" | "locarno" | "busan" | "bfi_london" | "san_sebastian" | "melbourne" | "sydney" | "mar_del_plata"} AwardFestivalFilterId
 */

/**
 * @typedef {{
 *   id: AwardFestivalFilterId,
 *   label: string,
 *   description: string,
 * }} AwardFestivalFilter
 */

/** Minimum distinct catalog films before a festival appears in the picker. */
export const AWARD_FESTIVAL_MIN_FILMS = 11;

/**
 * Badge festivals that are also Resonale majors (participation).
 * Order matches festival badge prominence.
 * @type {readonly AwardFestivalFilter[]}
 */
export const AWARD_FESTIVAL_FILTERS = Object.freeze([
  {
    id: "annecy",
    label: "Annecy",
    description:
      "Films that played at Annecy International Animation Film Festival.",
  },
  {
    id: "ottawa",
    label: "Ottawa",
    description:
      "Films that played at Ottawa International Animation Festival.",
  },
  {
    id: "zagreb",
    label: "Zagreb",
    description: "Films that played at Animafest Zagreb.",
  },
  {
    id: "stuttgart",
    label: "Stuttgart",
    description:
      "Films that played at Stuttgart International Festival of Animated Film (ITFS).",
  },
  {
    id: "cannes",
    label: "Cannes",
    description: "Films that played at Cannes Film Festival.",
  },
  {
    id: "venice",
    label: "Venice",
    description: "Films that played at Venice International Film Festival.",
  },
  {
    id: "berlinale",
    label: "Berlinale",
    description: "Films that played at Berlin International Film Festival.",
  },
  {
    id: "tiff",
    label: "TIFF",
    description: "Films that played at Toronto International Film Festival.",
  },
  {
    id: "sundance",
    label: "Sundance",
    description: "Films that played at Sundance Film Festival.",
  },
  {
    id: "locarno",
    label: "Locarno",
    description: "Films that played at Locarno Film Festival.",
  },
  {
    id: "busan",
    label: "Busan",
    description: "Films that played at Busan International Film Festival.",
  },
  {
    id: "bfi_london",
    label: "BFI",
    description: "Films that played at BFI London Film Festival.",
  },
  {
    id: "san_sebastian",
    label: "San Sebastián",
    description:
      "Films that played at San Sebastián International Film Festival.",
  },
  {
    id: "melbourne",
    label: "MIFF",
    description: "Films that played at Melbourne International Film Festival.",
  },
  {
    id: "sydney",
    label: "Sydney",
    description: "Films that played at Sydney Film Festival.",
  },
  {
    id: "mar_del_plata",
    label: "Mar del Plata",
    description:
      "Films that played at Mar del Plata International Film Festival.",
  },
]);

const FILTER_BY_ID = new Map(
  AWARD_FESTIVAL_FILTERS.map((row) => [row.id, row])
);

const FILTER_ID_SET = new Set(AWARD_FESTIVAL_FILTERS.map((row) => row.id));

/**
 * @param {unknown} value
 * @returns {value is AwardFestivalFilterId}
 */
export function isAwardFestivalFilter(value) {
  return typeof value === "string" && FILTER_ID_SET.has(value);
}

/**
 * @param {{ festival_badges?: Array<{ id?: string | null }> | null }} film
 * @param {AwardFestivalFilterId} filterId
 */
export function filmMatchesAwardFestivalFilter(film, filterId) {
  if (!FILTER_ID_SET.has(filterId)) {
    return false;
  }

  return (film?.festival_badges ?? []).some((badge) => badge?.id === filterId);
}

/**
 * Majors that already clear the catalog threshold in production.
 * Always offered in the Award winners menu so the split does not depend on
 * a partially-hydrated client film slice.
 * @type {readonly AwardFestivalFilterId[]}
 */
export const AWARD_FESTIVAL_FILTERS_ALWAYS = Object.freeze([
  "annecy",
  "cannes",
  "tiff",
  "berlinale",
  "sundance",
]);

/**
 * Festivals with enough participation rows in the given catalog slice,
 * plus the always-on majors that already clear the production threshold.
 *
 * @param {Array<{ festival_badges?: Array<{ id?: string | null }> | null }>} films
 * @returns {AwardFestivalFilter[]}
 */
export function getAwardFestivalFiltersForFilms(films) {
  /** @type {Map<string, number>} */
  const counts = new Map();

  for (const film of films ?? []) {
    const seen = new Set();
    for (const badge of film?.festival_badges ?? []) {
      const id = badge?.id;
      if (!id || !FILTER_ID_SET.has(id) || seen.has(id)) {
        continue;
      }
      seen.add(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const always = new Set(AWARD_FESTIVAL_FILTERS_ALWAYS);

  return AWARD_FESTIVAL_FILTERS.filter(
    (row) =>
      always.has(row.id) || (counts.get(row.id) ?? 0) >= AWARD_FESTIVAL_MIN_FILMS
  );
}

/**
 * @param {AwardFestivalFilterId} filterId
 */
export function getAwardFestivalFilter(filterId) {
  return FILTER_BY_ID.get(filterId) ?? null;
}
