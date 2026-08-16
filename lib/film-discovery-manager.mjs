/**
 * Manager step: structured brief from catalog-analytics (no film picking).
 */

import {
  analyzeFilmCatalog,
  buildCurationSuggestions,
} from "./catalog-analytics.mjs";

/**
 * @param {import("../types/film").Film[] | object[]} films
 * @returns {import("./film-discovery.mjs").ManagerBrief}
 */
export function buildManagerBriefFromAnalytics(films) {
  const analytics = analyzeFilmCatalog(films);
  const suggestions = buildCurationSuggestions(analytics);

  const countryLow = (analytics.countryCoverage?.lowCoverage ?? [])
    .slice(0, 8)
    .map((entry) => entry.label);
  const countryHigh = (analytics.countryCoverage?.top ?? [])
    .slice(0, 5)
    .map((entry) => entry.label);
  const decadeLow = (analytics.decadeCoverage?.lowCoverage ?? [])
    .filter((entry) => entry.label !== "Unknown")
    .slice(0, 6)
    .map((entry) => entry.label);
  const techniqueLow = (analytics.techniqueCoverage?.lowCoverage ?? [])
    .slice(0, 6)
    .map((entry) => entry.label);
  const techniqueHigh = (analytics.techniqueCoverage?.top ?? [])
    .slice(0, 4)
    .map((entry) => entry.label);

  const moodRare = (analytics.moodCoverage?.rare ?? [])
    .slice(0, 5)
    .map((entry) => entry.tag);
  const aestheticRare = (analytics.aestheticTagCoverage?.rare ?? [])
    .slice(0, 5)
    .map((entry) => entry.tag);

  const priorityGenresOrThemes = [
    ...new Set([...moodRare, ...aestheticRare]),
  ].slice(0, 10);

  const overrepresented = [
    ...countryHigh.map((label) => `country:${label}`),
    ...techniqueHigh.map((label) => `technique:${label}`),
  ];

  const underrepresented = [
    ...countryLow.map((label) => `country:${label}`),
    ...decadeLow.map((label) => `decade:${label}`),
    ...techniqueLow.map((label) => `technique:${label}`),
    ...priorityGenresOrThemes.map((label) => `theme:${label}`),
  ];

  const batchRequirements = suggestions.items
    .filter((item) =>
      ["country gap", "period gap", "technique gap", "mood gap", "aesthetic gap", "narrative gap"].includes(
        item.category
      )
    )
    .slice(0, 10)
    .map((item) => item.suggestion);

  const summaryParts = [];
  if (countryLow.length > 0) {
    summaryParts.push(
      `Prioritize underrepresented countries/regions: ${countryLow.slice(0, 5).join(", ")}.`
    );
  }
  if (decadeLow.length > 0) {
    summaryParts.push(
      `Fill sparse decades: ${decadeLow.slice(0, 4).join(", ")}.`
    );
  }
  if (techniqueLow.length > 0) {
    summaryParts.push(
      `Seek underused techniques: ${techniqueLow.slice(0, 4).join(", ")}.`
    );
  }
  if (priorityGenresOrThemes.length > 0) {
    summaryParts.push(
      `Themes/moods to enrich: ${priorityGenresOrThemes.slice(0, 5).join(", ")}.`
    );
  }
  if (summaryParts.length === 0) {
    summaryParts.push(
      "Catalog coverage is relatively balanced; prioritize independent auteur/festival features that increase overall diversity."
    );
  }

  return {
    priorityCountries: countryLow,
    priorityYearsOrDecades: decadeLow,
    priorityGenresOrThemes,
    priorityTechniques: techniqueLow,
    overrepresented,
    underrepresented,
    batchRequirements,
    summary: summaryParts.join(" "),
  };
}

/**
 * Human-readable brief block for prompts and email.
 * @param {import("./film-discovery.mjs").ManagerBrief} brief
 */
export function formatManagerBrief(brief) {
  return [
    `Summary: ${brief.summary}`,
    `Priority countries/regions: ${brief.priorityCountries.join("; ") || "n/a"}`,
    `Priority years/decades: ${brief.priorityYearsOrDecades.join("; ") || "n/a"}`,
    `Priority genres/themes: ${brief.priorityGenresOrThemes.join("; ") || "n/a"}`,
    `Priority techniques: ${brief.priorityTechniques.join("; ") || "n/a"}`,
    `Overrepresented: ${brief.overrepresented.join("; ") || "n/a"}`,
    `Underrepresented: ${brief.underrepresented.join("; ") || "n/a"}`,
    `Batch requirements:`,
    ...(brief.batchRequirements.length > 0
      ? brief.batchRequirements.map((item) => `- ${item}`)
      : ["- (none)"]),
  ].join("\n");
}
