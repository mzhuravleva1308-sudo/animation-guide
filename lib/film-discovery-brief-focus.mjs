/**
 * Narrow Manager briefs to one gap axis and pick catalog films that already
 * sit in that gap (for a short, relevant Researcher exclusion list).
 */

import {
  getDecadeLabel,
  normalizeCountryName,
  normalizeTechniqueName,
  splitCountries,
  splitTechniques,
} from "./catalog-analytics.mjs";

export const BRIEF_FOCUS = Object.freeze({
  mixed: "mixed",
  country: "country",
  decade: "decade",
  technique: "technique",
});

/**
 * @param {import("./film-discovery.mjs").ManagerBrief} brief
 * @param {"mixed" | "country" | "decade" | "technique"} focus
 * @returns {import("./film-discovery.mjs").ManagerBrief}
 */
export function focusManagerBrief(brief, focus = BRIEF_FOCUS.mixed) {
  if (focus === BRIEF_FOCUS.mixed || !focus) {
    return { ...brief, focus: BRIEF_FOCUS.mixed };
  }

  if (focus === BRIEF_FOCUS.country) {
    const countries = (brief.priorityCountries ?? []).slice(0, 5);
    return {
      priorityCountries: countries,
      priorityYearsOrDecades: [],
      priorityGenresOrThemes: [],
      priorityTechniques: [],
      overrepresented: (brief.overrepresented ?? []).filter((item) =>
        String(item).startsWith("country:")
      ),
      underrepresented: countries.map((c) => `country:${c}`),
      batchRequirements: countries.map((c) => `Expand coverage for ${c}`),
      summary: `Primary goal only: find feature-length animation from underrepresented countries/regions: ${countries.join(", ") || "n/a"}. Ignore decade/technique/theme gaps for this run.`,
      focus: BRIEF_FOCUS.country,
    };
  }

  if (focus === BRIEF_FOCUS.decade) {
    const decades = (brief.priorityYearsOrDecades ?? []).slice(0, 3);
    return {
      priorityCountries: [],
      priorityYearsOrDecades: decades,
      priorityGenresOrThemes: [],
      priorityTechniques: [],
      overrepresented: [],
      underrepresented: decades.map((d) => `decade:${d}`),
      batchRequirements: decades.map((d) => `Fill sparse decade ${d}`),
      summary: `Primary goal only: find feature-length animation from sparse decades: ${decades.join(", ") || "n/a"}. Ignore country/technique/theme gaps for this run.`,
      focus: BRIEF_FOCUS.decade,
    };
  }

  if (focus === BRIEF_FOCUS.technique) {
    const techniques = (brief.priorityTechniques ?? []).slice(0, 4);
    return {
      priorityCountries: [],
      priorityYearsOrDecades: [],
      priorityGenresOrThemes: [],
      priorityTechniques: techniques,
      overrepresented: (brief.overrepresented ?? []).filter((item) =>
        String(item).startsWith("technique:")
      ),
      underrepresented: techniques.map((t) => `technique:${t}`),
      batchRequirements: techniques.map((t) => `Add films using ${t}`),
      summary: `Primary goal only: find feature-length animation using underused techniques: ${techniques.join(", ") || "n/a"}. Ignore country/decade/theme gaps for this run.`,
      focus: BRIEF_FOCUS.technique,
    };
  }

  throw new Error(`Unknown brief focus: ${focus}`);
}

/**
 * @param {string} filmCountry
 * @param {string} priorityCountry
 */
export function countryMatchesPriority(filmCountry, priorityCountry) {
  const a = normalizeCountryName(filmCountry) ?? String(filmCountry ?? "").trim();
  const b =
    normalizeCountryName(priorityCountry) ??
    String(priorityCountry ?? "").trim();
  if (!a || !b) return false;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return true;
  if (al.includes(bl) || bl.includes(al)) return true;
  // Bosnia / Herzegovina ↔ Bosnia and Herzegovina
  if (
    (al.includes("bosnia") || al.includes("herzegovina")) &&
    (bl.includes("bosnia") || bl.includes("herzegovina"))
  ) {
    return true;
  }
  return false;
}

/**
 * @param {object} film
 * @param {import("./film-discovery.mjs").ManagerBrief} brief
 */
export function filmMatchesBriefGap(film, brief) {
  const countries = splitCountries(film.country ?? film.countries);
  const techniques = splitTechniques(film.technique);
  const decade = getDecadeLabel(film.year);

  const countryHit = (brief.priorityCountries ?? []).some((priority) =>
    countries.some((country) => countryMatchesPriority(country, priority))
  );
  const decadeHit = (brief.priorityYearsOrDecades ?? []).includes(decade);
  const techniqueHit = (brief.priorityTechniques ?? []).some((priority) => {
    const want = normalizeTechniqueName(priority) ?? String(priority).toLowerCase();
    return techniques.some((technique) => {
      const have =
        normalizeTechniqueName(technique) ?? String(technique).toLowerCase();
      return have === want || have.includes(want) || want.includes(have);
    });
  });

  const focus = brief.focus ?? BRIEF_FOCUS.mixed;
  if (focus === BRIEF_FOCUS.country) return countryHit;
  if (focus === BRIEF_FOCUS.decade) return decadeHit;
  if (focus === BRIEF_FOCUS.technique) return techniqueHit;
  return countryHit || decadeHit || techniqueHit;
}

/**
 * Catalog (+ optional staging) rows that already sit inside the brief gap.
 * Used as the Researcher prompt exclusion list in "relevant" mode.
 *
 * @param {object[]} films
 * @param {import("./film-discovery.mjs").ManagerBrief} brief
 * @param {{ max?: number }} [options]
 */
export function selectBriefRelevantFilms(films, brief, options = {}) {
  const max = options.max ?? 80;
  const matched = (films ?? []).filter((film) => filmMatchesBriefGap(film, brief));
  // Prefer denser evidence first (same gap, known titles).
  return matched.slice(0, max);
}
