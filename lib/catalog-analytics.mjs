import { getFilmPosterUrl } from "./film-poster.mjs";
import {
  getTitleSimilarity,
  normalizeFilmString,
} from "./film-duplicate-check.mjs";

const UNKNOWN_VALUES = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "tbd",
  "?",
  "-",
  "—",
  "unspecified",
  "not specified",
  "not available",
]);

const PLACEHOLDER_PATTERNS = [
  /^todo$/i,
  /^placeholder$/i,
  /^lorem/i,
  /^test$/i,
  /^xxx+$/i,
  /^\.{2,}$/,
];

const ANIMATION_FESTIVAL_KEYS = [
  { key: "annecy", label: "Annecy" },
  { key: "ottawa", label: "Ottawa" },
  { key: "animafest", label: "Animafest Zagreb" },
  { key: "hiroshima", label: "Hiroshima" },
  { key: "fantoche", label: "Fantoche" },
  { key: "kaboom", label: "Kaboom" },
  { key: "anima", label: "Anima" },
  { key: "sac", label: "SAC" },
];

const GENERAL_FESTIVAL_KEYS = [
  { key: "cannes", label: "Cannes" },
  { key: "berlinale", label: "Berlinale" },
  { key: "berlin", label: "Berlin" },
  { key: "venice", label: "Venice" },
  { key: "sundance", label: "Sundance" },
  { key: "locarno", label: "Locarno" },
  { key: "rotterdam", label: "Rotterdam" },
  { key: "toronto", label: "Toronto" },
  { key: "san sebastian", label: "San Sebastian" },
];

const MULTI_VALUE_SPLIT_PATTERN = /\s*(?:[,;/]|(?:\s+and\s+)|(?:\s*&\s*))\s*/i;

/** @type {Map<string, string>} */
const COUNTRY_ALIASES = new Map([
  ["usa", "United States"],
  ["us", "United States"],
  ["united states of america", "United States"],
  ["united states", "United States"],
  ["uk", "United Kingdom"],
  ["great britain", "United Kingdom"],
  ["united kingdom", "United Kingdom"],
  ["west germany", "Germany"],
  ["czechoslovakia", "Czech Republic"],
]);

export const CURATION_REGION_OTHER = "Other / mixed / unknown";

/**
 * Macro curation basins with example countries in the label for transparency.
 * @type {readonly { label: string, countries: readonly string[] }[]}
 */
export const CURATION_REGION_CATALOG = [
  {
    label: "Western Europe (France, Germany, Spain, Italy, Belgium, …)",
    countries: [
      "France",
      "Belgium",
      "Luxembourg",
      "Germany",
      "Switzerland",
      "Italy",
      "Netherlands",
      "Austria",
      "Portugal",
      "Spain",
      "Denmark",
      "Sweden",
      "Norway",
      "Finland",
      "Iceland",
    ],
  },
  {
    label: "Central & Eastern Europe (Czech Republic, Poland, Romania, …)",
    countries: [
      "Czech Republic",
      "Slovakia",
      "Poland",
      "Croatia",
      "Hungary",
      "Estonia",
      "Latvia",
      "Lithuania",
      "Slovenia",
      "Romania",
    ],
  },
  {
    label: "British Isles (United Kingdom, Ireland, …)",
    countries: ["United Kingdom", "Ireland"],
  },
  {
    label:
      "Anglophone North Atlantic (United States, Canada, Australia, …)",
    countries: [
      "United States",
      "Canada",
      "Australia",
      "New Zealand",
    ],
  },
  {
    label: "Japan",
    countries: ["Japan"],
  },
  {
    label: "Asia excl. Japan (China, South Korea, India, Singapore, …)",
    countries: [
      "China",
      "Hong Kong",
      "Taiwan",
      "Singapore",
      "South Korea",
      "India",
      "Indonesia",
    ],
  },
  {
    label: "Latin America (Brazil, Mexico, Argentina, Chile, …)",
    countries: ["Chile", "Argentina", "Brazil", "Mexico", "Colombia"],
  },
  {
    label: "Middle East & Turkey (Iran, Israel, Turkey, Lebanon, …)",
    countries: [
      "Iran",
      "Israel",
      "Qatar",
      "Lebanon",
      "Palestine",
      "Turkey",
    ],
  },
];

/** @type {readonly string[]} */
export const CURATION_REGIONS = [
  ...CURATION_REGION_CATALOG.map((entry) => entry.label),
  CURATION_REGION_OTHER,
];

/**
 * Macro curation basins for analytics only. Countries not listed map to
 * {@link CURATION_REGION_OTHER}. Co-productions use the first listed country
 * as the primary region (see {@link getPrimaryCountry}).
 * @type {Map<string, string>}
 */
const COUNTRY_TO_CURATION_REGION = new Map(
  CURATION_REGION_CATALOG.flatMap(({ label, countries }) =>
    countries.map((country) => [country, label])
  )
);

/**
 * @param {string} country
 */
function countryAliasLookupKey(country) {
  return country
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

/** @typedef {import("../types/film").Film} Film */

/**
 * @param {string | null | undefined} value
 */
export function isEmptyOrUnknownValue(value) {
  if (value == null) return true;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) return true;

  return UNKNOWN_VALUES.has(trimmed.toLowerCase());
}

/**
 * @param {string | null | undefined} value
 */
export function isSuspiciousPlaceholderValue(value) {
  if (isEmptyOrUnknownValue(value)) return false;
  const trimmed = value.trim();
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * @param {string | string[] | null | undefined} value
 * @returns {string[]}
 */
export function splitMultiValueField(value) {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => splitMultiValueField(entry))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") return [];

  return value
    .split(MULTI_VALUE_SPLIT_PATTERN)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !isEmptyOrUnknownValue(entry));
}

/**
 * @param {string | null | undefined} country
 */
export function normalizeCountryName(country) {
  const trimmed = country?.trim();
  if (!trimmed || isEmptyOrUnknownValue(trimmed)) return null;

  const cleaned = trimmed
    .replace(/\s+/g, " ")
    .replace(/\(\d{4}\)$/, "")
    .trim();

  const alias = COUNTRY_ALIASES.get(countryAliasLookupKey(cleaned));
  if (alias) return alias;

  return cleaned;
}

/**
 * @param {string | string[] | null | undefined} country
 */
export function splitCountries(country) {
  const parts = splitMultiValueField(country);
  const normalized = parts
    .map((part) => normalizeCountryName(part))
    .filter(Boolean);

  return [...new Set(normalized)];
}

/**
 * @param {string} country
 */
export function countryToCurationRegion(country) {
  return COUNTRY_TO_CURATION_REGION.get(country) ?? CURATION_REGION_OTHER;
}

/**
 * First normalized country in a film's country field (co-production tie-breaker).
 * @param {string | string[] | null | undefined} country
 * @returns {string | null}
 */
export function getPrimaryCountry(country) {
  const countries = splitCountries(country);
  return countries[0] ?? null;
}

/**
 * @param {string | string[] | null | undefined} country
 */
export function getPrimaryCurationRegion(country) {
  const primary = getPrimaryCountry(country);
  if (!primary) return CURATION_REGION_OTHER;
  return countryToCurationRegion(primary);
}

/**
 * @param {string[]} countries
 * @returns {string[]}
 */
export function countriesToCurationRegions(countries) {
  const primary = countries[0];
  if (!primary) return [CURATION_REGION_OTHER];
  return [countryToCurationRegion(primary)];
}

/**
 * Derives the primary curation region from a film's country field (analytics-only).
 * Co-productions count once, using the first listed country.
 * @param {string | string[] | null | undefined} country
 * @returns {string[]}
 */
export function splitCurationRegions(country) {
  return countriesToCurationRegions(splitCountries(country));
}

/**
 * @param {string | null | undefined} technique
 */
export function normalizeTechniqueName(technique) {
  const trimmed = technique?.trim();
  if (!trimmed || isEmptyOrUnknownValue(trimmed)) return null;

  return trimmed.replace(/\s+/g, " ").toLowerCase();
}

/**
 * @param {string | string[] | null | undefined} technique
 */
export function splitTechniques(technique) {
  const parts = splitMultiValueField(technique);
  const normalized = parts
    .map((part) => normalizeTechniqueName(part))
    .filter(Boolean);

  return [...new Set(normalized)];
}

/**
 * @param {number | null | undefined} year
 */
export function getDecadeLabel(year) {
  if (year == null || Number.isNaN(year)) return "Unknown";

  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

/**
 * @param {string[] | null | undefined} tags
 */
export function normalizeTagList(tags) {
  if (!Array.isArray(tags)) return [];

  const normalized = tags
    .map((tag) => tag?.trim())
    .filter((tag) => tag && !isEmptyOrUnknownValue(tag));

  return [...new Set(normalized)];
}

/**
 * @param {Record<string, number>} counts
 * @param {{ topLimit?: number, rareThreshold?: number, frequentMultiplier?: number }} [options]
 */
export function summarizeTagCounts(counts, options = {}) {
  const { topLimit = 10, rareThreshold = 1, frequentMultiplier = 2 } = options;
  const entries = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  const totalTagUses = entries.reduce((sum, [, count]) => sum + count, 0);
  const average =
    entries.length > 0 ? totalTagUses / entries.length : 0;
  const frequentThreshold = Math.max(
    3,
    Math.ceil(average * frequentMultiplier)
  );

  return {
    counts: Object.fromEntries(entries),
    top: entries.slice(0, topLimit).map(([tag, count]) => ({ tag, count })),
    rare: entries
      .filter(([, count]) => count <= rareThreshold)
      .map(([tag, count]) => ({ tag, count })),
    veryFrequent: entries
      .filter(([, count]) => count >= frequentThreshold)
      .map(([tag, count]) => ({ tag, count })),
    uniqueTags: entries.length,
    totalTagUses,
    averagePerTag: Number(average.toFixed(2)),
  };
}

/**
 * @param {string[] | null | undefined} tags
 */
export function countTags(tags) {
  return normalizeTagList(tags).length;
}

/**
 * @param {Film} film
 */
export function hasPoster(film) {
  return Boolean(getFilmPosterUrl(film));
}

/**
 * @param {Film} film
 */
export function hasDuration(film) {
  return (
    film.duration_minutes != null &&
    !Number.isNaN(film.duration_minutes) &&
    film.duration_minutes > 0
  );
}

/**
 * @param {Film} film
 */
export function hasTechnique(film) {
  return splitTechniques(film.technique).length > 0;
}

/**
 * @param {Film} film
 */
export function hasFestivalData(film) {
  return !isEmptyOrUnknownValue(film.festival);
}

/**
 * @param {Film} film
 */
export function hasSourceData(film) {
  return !isEmptyOrUnknownValue(film.source_url);
}

/**
 * @param {string | null | undefined} url
 */
export function extractSourceLabel(url) {
  if (isEmptyOrUnknownValue(url)) return null;

  try {
    const hostname = new URL(url.trim()).hostname.replace(/^www\./i, "");
    return hostname || url.trim();
  } catch {
    return url.trim();
  }
}

/**
 * @param {string | null | undefined} festival
 */
export function classifyFestival(festival) {
  if (isEmptyOrUnknownValue(festival)) {
    return { raw: null, normalized: null, type: "unknown" };
  }

  const normalized = festival.trim().toLowerCase();

  if (ANIMATION_FESTIVAL_KEYS.some(({ key }) => normalized.includes(key))) {
    return { raw: festival, normalized, type: "animation" };
  }

  if (GENERAL_FESTIVAL_KEYS.some(({ key }) => normalized.includes(key))) {
    return { raw: festival, normalized, type: "general" };
  }

  return { raw: festival, normalized, type: "other" };
}

/**
 * @param {Film} film
 */
export function filmSummary(film) {
  return {
    id: film.id,
    title: film.title,
    original_title: film.original_title ?? null,
    year: film.year ?? null,
    director: film.director ?? null,
  };
}

/**
 * @param {Film[]} films
 * @param {(film: Film) => string | null | undefined} getKey
 */
function groupFilmsByKey(films, getKey) {
  /** @type {Map<string, Film[]>} */
  const groups = new Map();

  for (const film of films) {
    const key = getKey(film)?.trim();
    if (!key) continue;

    const existing = groups.get(key) ?? [];
    existing.push(film);
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .filter(([, groupFilms]) => groupFilms.length > 1)
    .map(([key, groupFilms]) => ({
      key,
      films: groupFilms.map(filmSummary),
      count: groupFilms.length,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * @param {Film[]} films
 * @param {number} [similarityThreshold]
 */
export function findFuzzyTitleDuplicatePairs(films, similarityThreshold = 90) {
  /** @type {{ similarity: number, films: ReturnType<typeof filmSummary>[] }[]} */
  const pairs = [];

  for (let i = 0; i < films.length; i += 1) {
    for (let j = i + 1; j < films.length; j += 1) {
      const left = films[i];
      const right = films[j];
      const leftTitle = left.title ?? "";
      const rightTitle = right.title ?? "";
      const leftNormalized = normalizeFilmString(leftTitle);
      const rightNormalized = normalizeFilmString(rightTitle);

      if (!leftNormalized || !rightNormalized) continue;
      if (leftNormalized === rightNormalized) continue;

      const similarity = getTitleSimilarity(leftTitle, rightTitle);
      if (similarity < similarityThreshold) continue;

      pairs.push({
        similarity: Number(similarity.toFixed(1)),
        films: [filmSummary(left), filmSummary(right)],
      });
    }
  }

  return pairs.sort((a, b) => b.similarity - a.similarity);
}

/**
 * @param {Film[]} films
 */
export function findPotentialDuplicateGroups(films) {
  const normalizedTitleDuplicates = groupFilmsByKey(films, (film) =>
    normalizeFilmString(film.title)
  );
  const normalizedOriginalTitleDuplicates = groupFilmsByKey(films, (film) =>
    normalizeFilmString(film.original_title)
  );
  const titleYearDuplicates = groupFilmsByKey(
    films,
    (film) => {
      const title = normalizeFilmString(film.title);
      if (!title || film.year == null) return null;
      return `${title}|${film.year}`;
    }
  );
  const originalTitleYearDuplicates = groupFilmsByKey(
    films,
    (film) => {
      const title = normalizeFilmString(film.original_title);
      if (!title || film.year == null) return null;
      return `${title}|${film.year}`;
    }
  );
  const fuzzyTitlePairs = findFuzzyTitleDuplicatePairs(films);

  const groupCount =
    normalizedTitleDuplicates.length +
    normalizedOriginalTitleDuplicates.length +
    titleYearDuplicates.length +
    originalTitleYearDuplicates.length +
    fuzzyTitlePairs.length;

  return {
    normalizedTitleDuplicates,
    normalizedOriginalTitleDuplicates,
    titleYearDuplicates,
    originalTitleYearDuplicates,
    fuzzyTitlePairs,
    totalSignals: groupCount,
  };
}

/**
 * @param {Film} film
 */
export function getTotalTagCount(film) {
  return (
    countTags(film.moods) +
    countTags(film.aesthetic_tags) +
    countTags(film.narrative_tags)
  );
}

/**
 * @param {Film[]} films
 */
export function analyzeMetadataHealth(films) {
  const missingPoster = [];
  const missingDuration = [];
  const missingTechnique = [];
  const missingFestival = [];
  const suspiciousValues = [];
  const tooFewTags = [];
  const unusuallyManyTags = [];

  for (const film of films) {
    const summary = filmSummary(film);

    if (!hasPoster(film)) missingPoster.push(summary);
    if (!hasDuration(film)) missingDuration.push(summary);
    if (!hasTechnique(film)) missingTechnique.push(summary);
    if (!hasFestivalData(film)) missingFestival.push(summary);

    const suspiciousFields = [];
    for (const [field, value] of Object.entries({
      title: film.title,
      original_title: film.original_title,
      director: film.director,
      country: film.country,
      technique: film.technique,
      festival: film.festival,
      synopsis: film.synopsis,
    })) {
      if (isSuspiciousPlaceholderValue(value)) {
        suspiciousFields.push(field);
      }
    }

    if (suspiciousFields.length > 0) {
      suspiciousValues.push({ ...summary, fields: suspiciousFields });
    }

    const totalTags = getTotalTagCount(film);
    if (totalTags < 3) tooFewTags.push({ ...summary, totalTags });
    if (totalTags > 15) unusuallyManyTags.push({ ...summary, totalTags });
  }

  return {
    missingPoster,
    missingDuration,
    missingTechnique,
    missingFestival,
    suspiciousValues,
    tooFewTags,
    unusuallyManyTags,
  };
}

/**
 * @param {Record<string, number>} counts
 * @param {number} totalFilms
 * @param {{ lowThreshold?: number, topLimit?: number }} [options]
 */
export function summarizeCoverageCounts(counts, totalFilms, options = {}) {
  const { lowThreshold = 2, topLimit = 10 } = options;
  const entries = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  return {
    counts: Object.fromEntries(entries),
    top: entries.slice(0, topLimit).map(([label, count]) => ({ label, count })),
    lowCoverage: entries
      .filter(([, count]) => count <= lowThreshold)
      .map(([label, count]) => ({ label, count })),
    uniqueValues: entries.length,
    totalFilms,
  };
}

/**
 * @param {Film[]} films
 */
export function buildCurationSuggestions(analytics) {
  /** @type {{ priority: "high" | "medium" | "low", category: string, suggestion: string, rationale: string }[]} */
  const suggestions = [];

  const {
    overview,
    metadataHealth,
    countryCoverage,
    decadeCoverage,
    techniqueCoverage,
    moodCoverage,
    aestheticTagCoverage,
    narrativeTagCoverage,
    festivalCoverage,
    sourceCoverage,
    potentialDuplicates,
  } = analytics;

  if (overview.withoutPoster > 0) {
    suggestions.push({
      priority: "high",
      category: "metadata cleanup",
      suggestion: "Fix missing posters before the next import batch",
      rationale: `${overview.withoutPoster} films are missing poster images.`,
    });
  }

  if (metadataHealth.tooFewTags.length > 0) {
    suggestions.push({
      priority: "high",
      category: "metadata cleanup",
      suggestion: "Enrich films with too few tags",
      rationale: `${metadataHealth.tooFewTags.length} films have fewer than 3 combined mood/aesthetic/narrative tags.`,
    });
  }

  if (potentialDuplicates.totalSignals > 0) {
    suggestions.push({
      priority: "high",
      category: "duplicate review",
      suggestion: "Review potential duplicate groups before importing similar titles",
      rationale: `${potentialDuplicates.totalSignals} duplicate signals were detected across title/year/fuzzy checks.`,
    });
  }

  for (const entry of techniqueCoverage.lowCoverage.slice(0, 5)) {
    suggestions.push({
      priority: "medium",
      category: "technique gap",
      suggestion: `Add films using ${entry.label}`,
      rationale: `Only ${entry.count} catalog ${entry.count === 1 ? "film uses" : "films use"} this technique.`,
    });
  }

  for (const entry of countryCoverage.lowCoverage.slice(0, 5)) {
    suggestions.push({
      priority: "medium",
      category: "country gap",
      suggestion: `Expand coverage for ${entry.label}`,
      rationale: `Only ${entry.count} catalog ${entry.count === 1 ? "film is" : "films are"} tagged with this country.`,
    });
  }

  const sparseDecades = (decadeCoverage.lowCoverage ?? [])
    .filter((entry) => entry.label !== "Unknown")
    .slice(0, 4);

  if (sparseDecades.length > 0) {
    suggestions.push({
      priority: "medium",
      category: "period gap",
      suggestion: `Consider films from underrepresented decades: ${sparseDecades.map((entry) => entry.label).join(", ")}`,
      rationale: "These decades have only one represented film in the catalog.",
    });
  }

  if (overview.from2020Onward < Math.ceil(overview.totalFilms * 0.1)) {
    suggestions.push({
      priority: "low",
      category: "period gap",
      suggestion: "Add recent films from 2020 onward",
      rationale: `Only ${overview.from2020Onward} films are from 2020 or later.`,
    });
  }

  for (const entry of moodCoverage.rare.slice(0, 3)) {
    suggestions.push({
      priority: "low",
      category: "mood gap",
      suggestion: `Find films expressing the rare mood "${entry.tag}"`,
      rationale: `This mood appears on only ${entry.count} film(s).`,
    });
  }

  for (const entry of aestheticTagCoverage.rare.slice(0, 3)) {
    suggestions.push({
      priority: "low",
      category: "aesthetic gap",
      suggestion: `Find films with the rare aesthetic tag "${entry.tag}"`,
      rationale: `This aesthetic tag appears on only ${entry.count} film(s).`,
    });
  }

  for (const entry of narrativeTagCoverage.rare.slice(0, 3)) {
    suggestions.push({
      priority: "low",
      category: "narrative gap",
      suggestion: `Find films with the rare narrative tag "${entry.tag}"`,
      rationale: `This narrative tag appears on only ${entry.count} film(s).`,
    });
  }

  if (festivalCoverage.available && festivalCoverage.withoutFestival > 0) {
    suggestions.push({
      priority: "medium",
      category: "festival metadata",
      suggestion: "Backfill missing festival data for existing films",
      rationale: `${festivalCoverage.withoutFestival} films have no festival field.`,
    });
  }

  if (sourceCoverage.available && sourceCoverage.withoutSource > 0) {
    suggestions.push({
      priority: "low",
      category: "source metadata",
      suggestion: "Backfill missing source_url values where possible",
      rationale: `${sourceCoverage.withoutSource} films have no source_url.`,
    });
  }

  return {
    note: "Suggestions are deterministic and based on catalog coverage only, not user behavior or AI inference.",
    items: suggestions,
  };
}

/**
 * @param {Film[]} films
 */
export function analyzeFilmCatalog(films) {
  const totalFilms = films.length;

  let withPoster = 0;
  let withDuration = 0;
  let withTechnique = 0;
  let withFestival = 0;
  let moodTagTotal = 0;
  let aestheticTagTotal = 0;
  let narrativeTagTotal = 0;
  let from2020Onward = 0;

  /** @type {Record<string, number>} */
  const countryCounts = {};
  /** @type {Record<string, number>} */
  const curationRegionCounts = {};
  /** @type {Record<string, number>} */
  const decadeCounts = {};
  /** @type {Record<string, number>} */
  const techniqueCounts = {};
  /** @type {Record<string, number>} */
  const festivalCounts = {};
  /** @type {Record<string, number>} */
  const sourceCounts = {};
  /** @type {Record<string, number>} */
  const moodCounts = {};
  /** @type {Record<string, number>} */
  const aestheticCounts = {};
  /** @type {Record<string, number>} */
  const narrativeCounts = {};

  let animationFestivalFilms = 0;
  let generalFestivalFilms = 0;
  let otherFestivalFilms = 0;
  let withSource = 0;

  /** @type {Film[]} */
  const filmsWithYear = [];

  for (const film of films) {
    if (hasPoster(film)) withPoster += 1;
    if (hasDuration(film)) withDuration += 1;
    if (hasTechnique(film)) withTechnique += 1;
    if (hasFestivalData(film)) withFestival += 1;

    moodTagTotal += countTags(film.moods);
    aestheticTagTotal += countTags(film.aesthetic_tags);
    narrativeTagTotal += countTags(film.narrative_tags);

    if (film.year != null && film.year >= 2020) from2020Onward += 1;
    if (film.year != null) filmsWithYear.push(film);

    for (const country of splitCountries(film.country)) {
      countryCounts[country] = (countryCounts[country] ?? 0) + 1;
    }

    for (const region of splitCurationRegions(film.country)) {
      curationRegionCounts[region] = (curationRegionCounts[region] ?? 0) + 1;
    }

    const decade = getDecadeLabel(film.year);
    decadeCounts[decade] = (decadeCounts[decade] ?? 0) + 1;

    for (const technique of splitTechniques(film.technique)) {
      techniqueCounts[technique] = (techniqueCounts[technique] ?? 0) + 1;
    }

    if (hasFestivalData(film)) {
      const festivalLabel = film.festival.trim();
      festivalCounts[festivalLabel] = (festivalCounts[festivalLabel] ?? 0) + 1;

      const classification = classifyFestival(film.festival);
      if (classification.type === "animation") animationFestivalFilms += 1;
      else if (classification.type === "general") generalFestivalFilms += 1;
      else otherFestivalFilms += 1;
    }

    if (hasSourceData(film)) {
      withSource += 1;
      const sourceLabel = extractSourceLabel(film.source_url);
      if (sourceLabel) {
        sourceCounts[sourceLabel] = (sourceCounts[sourceLabel] ?? 0) + 1;
      }
    }

    for (const tag of normalizeTagList(film.moods)) {
      moodCounts[tag] = (moodCounts[tag] ?? 0) + 1;
    }
    for (const tag of normalizeTagList(film.aesthetic_tags)) {
      aestheticCounts[tag] = (aestheticCounts[tag] ?? 0) + 1;
    }
    for (const tag of normalizeTagList(film.narrative_tags)) {
      narrativeCounts[tag] = (narrativeCounts[tag] ?? 0) + 1;
    }
  }

  const sortedByYear = [...filmsWithYear].sort((a, b) => a.year - b.year);
  const oldestFilms = sortedByYear.slice(0, 5).map(filmSummary);
  const newestFilms = sortedByYear.slice(-5).reverse().map(filmSummary);

  const metadataHealth = analyzeMetadataHealth(films);
  const potentialDuplicates = findPotentialDuplicateGroups(films);

  const countryCoverage = summarizeCoverageCounts(countryCounts, totalFilms);
  const curationRegionCoverage = summarizeCoverageCounts(
    curationRegionCounts,
    totalFilms,
    { topLimit: CURATION_REGIONS.length }
  );
  const decadeCoverage = summarizeCoverageCounts(decadeCounts, totalFilms, {
    lowThreshold: 1,
  });
  const techniqueCoverage = summarizeCoverageCounts(techniqueCounts, totalFilms);

  const festivalCoverage = {
    available: true,
    field: "festival",
    withFestival,
    withoutFestival: totalFilms - withFestival,
    animationFestivalFilms,
    generalFestivalFilms,
    otherFestivalFilms,
    ...summarizeCoverageCounts(festivalCounts, totalFilms, { lowThreshold: 1 }),
  };

  const sourceCoverage = {
    available: true,
    field: "source_url",
    withSource,
    withoutSource: totalFilms - withSource,
    ...summarizeCoverageCounts(sourceCounts, totalFilms, { lowThreshold: 1 }),
  };

  const moodCoverage = summarizeTagCounts(moodCounts);
  const aestheticTagCoverage = summarizeTagCounts(aestheticCounts);
  const narrativeTagCoverage = summarizeTagCounts(narrativeCounts);

  const overview = {
    totalFilms,
    withPoster,
    withoutPoster: totalFilms - withPoster,
    withDuration,
    withoutDuration: totalFilms - withDuration,
    withTechnique,
    withoutTechnique: totalFilms - withTechnique,
    withFestival,
    withoutFestival: totalFilms - withFestival,
    averageMoodsPerFilm:
      totalFilms > 0 ? Number((moodTagTotal / totalFilms).toFixed(2)) : 0,
    averageAestheticTagsPerFilm:
      totalFilms > 0
        ? Number((aestheticTagTotal / totalFilms).toFixed(2))
        : 0,
    averageNarrativeTagsPerFilm:
      totalFilms > 0
        ? Number((narrativeTagTotal / totalFilms).toFixed(2))
        : 0,
    from2020Onward,
  };

  const analytics = {
    generatedAt: new Date().toISOString(),
    overview,
    metadataHealth,
    countryCoverage,
    curationRegionCoverage,
    decadeCoverage: {
      ...decadeCoverage,
      oldestFilms,
      newestFilms,
      from2020Onward,
    },
    techniqueCoverage,
    festivalCoverage,
    sourceCoverage,
    moodCoverage,
    aestheticTagCoverage,
    narrativeTagCoverage,
    potentialDuplicates,
  };

  return {
    ...analytics,
    curationSuggestions: buildCurationSuggestions(analytics),
  };
}

/**
 * @param {ReturnType<typeof analyzeFilmCatalog>} analytics
 */
export function formatMarkdownReport(analytics) {
  const lines = [];

  lines.push("# Film Catalog Analysis");
  lines.push("");
  lines.push(`Generated: ${analytics.generatedAt}`);
  lines.push("");

  lines.push("## Catalog overview");
  lines.push("");
  lines.push(`- Total films: ${analytics.overview.totalFilms}`);
  lines.push(`- With poster: ${analytics.overview.withPoster}`);
  lines.push(`- Without poster: ${analytics.overview.withoutPoster}`);
  lines.push(`- With duration: ${analytics.overview.withDuration}`);
  lines.push(`- Without duration: ${analytics.overview.withoutDuration}`);
  lines.push(`- With technique: ${analytics.overview.withTechnique}`);
  lines.push(`- Without technique: ${analytics.overview.withoutTechnique}`);
  lines.push(`- With festival data: ${analytics.overview.withFestival}`);
  lines.push(`- Without festival data: ${analytics.overview.withoutFestival}`);
  lines.push(
    `- Average moods per film: ${analytics.overview.averageMoodsPerFilm}`
  );
  lines.push(
    `- Average aesthetic tags per film: ${analytics.overview.averageAestheticTagsPerFilm}`
  );
  lines.push(
    `- Average narrative tags per film: ${analytics.overview.averageNarrativeTagsPerFilm}`
  );
  lines.push(`- Films from 2020 onward: ${analytics.overview.from2020Onward}`);
  lines.push("");

  lines.push("## Metadata health");
  lines.push("");
  lines.push(
    `- Missing poster: ${analytics.metadataHealth.missingPoster.length}`
  );
  lines.push(
    `- Missing duration: ${analytics.metadataHealth.missingDuration.length}`
  );
  lines.push(
    `- Missing technique: ${analytics.metadataHealth.missingTechnique.length}`
  );
  lines.push(
    `- Missing festival: ${analytics.metadataHealth.missingFestival.length}`
  );
  lines.push(
    `- Suspicious placeholder values: ${analytics.metadataHealth.suspiciousValues.length}`
  );
  lines.push(`- Too few tags (<3): ${analytics.metadataHealth.tooFewTags.length}`);
  lines.push(
    `- Unusually many tags (>15): ${analytics.metadataHealth.unusuallyManyTags.length}`
  );
  lines.push("");

  appendCoverageSection(lines, "Country coverage", analytics.countryCoverage);
  appendCurationRegionSection(lines, analytics.curationRegionCoverage);
  appendDecadeSection(lines, analytics.decadeCoverage);
  appendCoverageSection(lines, "Technique coverage", analytics.techniqueCoverage);
  appendFestivalSection(lines, analytics.festivalCoverage);
  appendSourceSection(lines, analytics.sourceCoverage);
  appendTagSection(lines, "Mood coverage", analytics.moodCoverage);
  appendTagSection(lines, "Aesthetic tag coverage", analytics.aestheticTagCoverage);
  appendTagSection(lines, "Narrative tag coverage", analytics.narrativeTagCoverage);
  appendDuplicateSection(lines, analytics.potentialDuplicates);
  appendSuggestionsSection(lines, analytics.curationSuggestions);

  return `${lines.join("\n")}\n`;
}

/**
 * @param {string[]} lines
 * @param {string} title
 * @param {{ top?: { label: string, count: number }[], lowCoverage?: { label: string, count: number }[], uniqueValues?: number }} section
 */
function appendCoverageSection(lines, title, section) {
  lines.push(`## ${title}`);
  lines.push("");
  lines.push(`- Unique values: ${section.uniqueValues ?? 0}`);
  lines.push("- Top represented:");
  for (const entry of section.top ?? []) {
    lines.push(`  - ${entry.label}: ${entry.count}`);
  }
  lines.push("- Low coverage:");
  for (const entry of (section.lowCoverage ?? []).slice(0, 10)) {
    lines.push(`  - ${entry.label}: ${entry.count}`);
  }
  lines.push("");
}

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof analyzeFilmCatalog>["curationRegionCoverage"]} section
 */
function appendCurationRegionSection(lines, section) {
  lines.push("## Curation region coverage");
  lines.push("");
  lines.push(
    "Curation regions are macro programming basins derived from country metadata — not stored production fields. Each film is counted once using its first listed country as the primary region; use country coverage for full co-production detail."
  );
  lines.push("");
  lines.push(`- Unique values: ${section.uniqueValues ?? 0}`);
  lines.push("- Coverage by region:");
  for (const entry of section.top ?? []) {
    lines.push(`  - ${entry.label}: ${entry.count}`);
  }
  lines.push("- Low coverage:");
  for (const entry of (section.lowCoverage ?? []).slice(0, 10)) {
    lines.push(`  - ${entry.label}: ${entry.count}`);
  }
  lines.push("");
}

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof analyzeFilmCatalog>["decadeCoverage"]} section
 */
function appendDecadeSection(lines, section) {
  lines.push("## Period coverage");
  lines.push("");
  lines.push("- Count by decade:");
  for (const entry of section.top ?? []) {
    lines.push(`  - ${entry.label}: ${entry.count}`);
  }
  lines.push("- Oldest films:");
  for (const film of section.oldestFilms ?? []) {
    lines.push(
      `  - ${film.title}${film.year ? ` (${film.year})` : ""}${film.director ? ` — ${film.director}` : ""}`
    );
  }
  lines.push("- Newest films:");
  for (const film of section.newestFilms ?? []) {
    lines.push(
      `  - ${film.title}${film.year ? ` (${film.year})` : ""}${film.director ? ` — ${film.director}` : ""}`
    );
  }
  lines.push(`- Films from 2020 onward: ${section.from2020Onward ?? 0}`);
  lines.push("");
}

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof analyzeFilmCatalog>["festivalCoverage"]} section
 */
function appendFestivalSection(lines, section) {
  lines.push("## Festival coverage");
  lines.push("");
  if (!section.available) {
    lines.push("Festival coverage is not available (no festival field).");
    lines.push("");
    return;
  }

  lines.push(`- With festival data: ${section.withFestival}`);
  lines.push(`- Without festival data: ${section.withoutFestival}`);
  lines.push(`- Animation festival films: ${section.animationFestivalFilms}`);
  lines.push(`- General festival films: ${section.generalFestivalFilms}`);
  lines.push(`- Other festival films: ${section.otherFestivalFilms}`);
  lines.push("- Top festivals:");
  for (const entry of section.top ?? []) {
    lines.push(`  - ${entry.label}: ${entry.count}`);
  }
  lines.push("");
}

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof analyzeFilmCatalog>["sourceCoverage"]} section
 */
function appendSourceSection(lines, section) {
  lines.push("## Source coverage");
  lines.push("");
  if (!section.available) {
    lines.push("Source coverage is not available (no source field).");
    lines.push("");
    return;
  }

  lines.push(`- With source_url: ${section.withSource}`);
  lines.push(`- Without source_url: ${section.withoutSource}`);
  lines.push("- Top sources (by domain):");
  for (const entry of section.top ?? []) {
    lines.push(`  - ${entry.label}: ${entry.count}`);
  }
  lines.push("");
}

/**
 * @param {string[]} lines
 * @param {string} title
 * @param {{ top?: { tag: string, count: number }[], rare?: { tag: string, count: number }[], veryFrequent?: { tag: string, count: number }[] }} section
 */
function appendTagSection(lines, title, section) {
  lines.push(`## ${title}`);
  lines.push("");
  lines.push("- Top tags:");
  for (const entry of section.top ?? []) {
    lines.push(`  - ${entry.tag}: ${entry.count}`);
  }
  lines.push("- Rare tags:");
  for (const entry of (section.rare ?? []).slice(0, 10)) {
    lines.push(`  - ${entry.tag}: ${entry.count}`);
  }
  lines.push("- Very frequent tags:");
  for (const entry of section.veryFrequent ?? []) {
    lines.push(`  - ${entry.tag}: ${entry.count}`);
  }
  lines.push("");
}

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof analyzeFilmCatalog>["potentialDuplicates"]} section
 */
function appendDuplicateSection(lines, section) {
  lines.push("## Potential duplicates");
  lines.push("");
  lines.push(`- Total duplicate signals: ${section.totalSignals}`);
  appendDuplicateGroupList(lines, "Normalized title duplicates", section.normalizedTitleDuplicates);
  appendDuplicateGroupList(
    lines,
    "Normalized original title duplicates",
    section.normalizedOriginalTitleDuplicates
  );
  appendDuplicateGroupList(lines, "Same title + year", section.titleYearDuplicates);
  appendDuplicateGroupList(
    lines,
    "Same original title + year",
    section.originalTitleYearDuplicates
  );

  lines.push("- Fuzzy similar title pairs:");
  for (const pair of section.fuzzyTitlePairs.slice(0, 20)) {
    const titles = pair.films.map((film) => film.title).join(" / ");
    lines.push(`  - ${titles} (similarity ${pair.similarity})`);
  }
  lines.push("");
}

/**
 * @param {string[]} lines
 * @param {string} title
 * @param {{ key: string, films: ReturnType<typeof filmSummary>[], count: number }[]} groups
 */
function appendDuplicateGroupList(lines, title, groups) {
  lines.push(`- ${title}: ${groups.length}`);
  for (const group of groups.slice(0, 10)) {
    const titles = group.films
      .map((film) => `${film.title}${film.year ? ` (${film.year})` : ""}`)
      .join(" / ");
    lines.push(`  - ${titles}`);
  }
}

/**
 * @param {string[]} lines
 * @param {ReturnType<typeof buildCurationSuggestions>} suggestions
 */
function appendSuggestionsSection(lines, suggestions) {
  lines.push("## Suggested curation gaps / next batch ideas");
  lines.push("");
  lines.push(suggestions.note);
  lines.push("");
  for (const item of suggestions.items) {
    lines.push(
      `- [${item.priority}] ${item.category}: ${item.suggestion} — ${item.rationale}`
    );
  }
  lines.push("");
}
