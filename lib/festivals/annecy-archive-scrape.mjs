/**
 * Parse Annecy archive official-selection list pages (feature sections only).
 * Network I/O + TMDB enrichment live in scripts/scrape-annecy-archive.mjs.
 *
 * Sections:
 *   :lm   Official Feature Films (competition) — from 2012
 *   :lmcc Feature Films Contrechamp — from 2019
 */

import { DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES } from "../film-discovery.mjs";
import { normalizeFilmString } from "../film-duplicate-check.mjs";

export const ANNECY_ARCHIVE_BASE = "https://www.annecyfestival.com/about/archives";
export const ANNECY_USER_AGENT =
  "ResonaleAnnecyScrape/1.0 (+https://resonale.com; festival archive import)";

export const ANNECY_FEATURE_MIN_RUNTIME_MINUTES =
  DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES;

/** @type {Record<string, { code: string, label: string, fromYear: number }>} */
export const ANNECY_FEATURE_SECTIONS = {
  lm: {
    code: "lm",
    label: "Official Feature Films",
    fromYear: 2012,
  },
  lmcc: {
    code: "lmcc",
    label: "Feature Films Contrechamp",
    fromYear: 2019,
  },
};

/**
 * @param {number} year
 * @param {string} sectionCode — lm | lmcc
 */
export function annecyOfficialSelectionListUrl(year, sectionCode) {
  return `${ANNECY_ARCHIVE_BASE}/${year}/official-selection:${sectionCode}`;
}

/**
 * @param {number} year
 * @param {string | number} filmId
 */
export function annecyFilmIndexUrl(year, filmId) {
  return `${ANNECY_ARCHIVE_BASE}/${year}/official-selection/film-index:film-${filmId}`;
}

/**
 * @param {string} value
 */
export function cleanAnnecyText(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Ignacio FERRERAS" / "Sam FELL, Chris BUTLER" → display-ish names.
 * @param {string} raw
 * @returns {string[]}
 */
export function parseAnnecyDirectors(raw) {
  return cleanAnnecyText(raw)
    .split(/\s*,\s*/)
    .map((part) => cleanAnnecyText(part))
    .filter(Boolean);
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function parseAnnecyCountries(raw) {
  return cleanAnnecyText(raw)
    .split(/\s*,\s*/)
    .map((part) => cleanAnnecyText(part))
    .filter(Boolean);
}

/**
 * Parse feature list HTML (`:lm` / `:lmcc`).
 * @param {string} html
 * @param {{ festivalYear: number, section: string, sectionLabel?: string, sourceUrl?: string }} meta
 * @returns {object[]}
 */
export function parseAnnecyFeatureListPage(html, meta) {
  const { festivalYear, section, sectionLabel, sourceUrl } = meta;
  /** @type {object[]} */
  const rows = [];
  /** @type {Set<string>} */
  const seenIds = new Set();

  const listMatch = html.match(
    /<ul[^>]*class="[^"]*liste_films[^"]*"[^>]*>([\s\S]*?)<\/ul>/i
  );
  const body = listMatch ? listMatch[1] : html;

  for (const li of body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = li[1];
    const idMatch = block.match(/film-index:film-(\d+)/i);
    if (!idMatch) continue;
    const filmId = idMatch[1];
    if (seenIds.has(filmId)) continue;
    seenIds.add(filmId);

    const titleMatch = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = cleanAnnecyText(
      titleMatch ? titleMatch[1].replace(/<[^>]+>/g, " ") : ""
    );
    if (!title) continue;

    const directorsMatch = block.match(
      /Directed by:\s*<\/span>\s*([\s\S]*?)<\/h4>/i
    );
    const countriesMatch = block.match(
      /Country:\s*<\/span>\s*([\s\S]*?)<\/h4>/i
    );
    const directors = parseAnnecyDirectors(
      directorsMatch ? directorsMatch[1].replace(/<[^>]+>/g, " ") : ""
    );
    const countries = parseAnnecyCountries(
      countriesMatch ? countriesMatch[1].replace(/<[^>]+>/g, " ") : ""
    );

    const posterMatch = block.match(/<img[^>]+src="([^"]+)"[^>]*>/i);
    const posterUrl = posterMatch ? posterMatch[1] : null;

    rows.push({
      film_id: filmId,
      title,
      original_title: null,
      directors,
      countries,
      festival_year: festivalYear,
      section,
      section_label: sectionLabel ?? ANNECY_FEATURE_SECTIONS[section]?.label ?? section,
      source_url: sourceUrl ?? annecyOfficialSelectionListUrl(festivalYear, section),
      detail_url: annecyFilmIndexUrl(festivalYear, filmId),
      poster_url: posterUrl,
      year: null,
      runtime_minutes: null,
    });
  }

  return rows;
}

/**
 * @param {object} film
 */
export function isAnnecyFeatureFilm(film) {
  return (
    Number.isInteger(film?.runtime_minutes) &&
    film.runtime_minutes >= ANNECY_FEATURE_MIN_RUNTIME_MINUTES
  );
}

/**
 * @param {{ title?: string | null, year?: number | null }} film
 */
export function annecyIdentityKey(film) {
  const title = normalizeFilmString(film?.title ?? "");
  const year = film?.year;
  if (!title || !Number.isInteger(year)) return null;
  return `${title}:${year}`;
}

/**
 * Dedupe enriched feature rows for discovery-minimal seed.
 * Prefer earliest festival year; merge section labels.
 * @param {object[]} films
 */
export function selectAnnecyFeatureSeedRows(films) {
  /** @type {Map<string, object>} */
  const byIdentity = new Map();

  for (const film of films) {
    if (!isAnnecyFeatureFilm(film)) continue;
    if (!film.title || !Number.isInteger(film.year)) continue;
    if (!Array.isArray(film.directors) || film.directors.length === 0) continue;
    if (!Array.isArray(film.countries) || film.countries.length === 0) continue;

    const key = annecyIdentityKey(film);
    if (!key) continue;

    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, {
        ...film,
        festival_years: [film.festival_year].filter((y) =>
          Number.isInteger(y)
        ),
        sections: film.section ? [film.section] : [],
      });
      continue;
    }

    const years = new Set(existing.festival_years ?? []);
    if (Number.isInteger(film.festival_year)) years.add(film.festival_year);
    existing.festival_years = [...years].sort((a, b) => a - b);

    const sections = new Set(existing.sections ?? []);
    if (film.section) sections.add(film.section);
    existing.sections = [...sections];

    if (
      Number.isInteger(film.festival_year) &&
      Number.isInteger(existing.festival_year) &&
      film.festival_year < existing.festival_year
    ) {
      existing.festival_year = film.festival_year;
      existing.source_url = film.source_url;
      existing.detail_url = film.detail_url;
      existing.section = film.section;
      existing.section_label = film.section_label;
    }
    if ((film.directors?.length ?? 0) > (existing.directors?.length ?? 0)) {
      existing.directors = film.directors;
    }
    if ((film.countries?.length ?? 0) > (existing.countries?.length ?? 0)) {
      existing.countries = film.countries;
    }
    if (!existing.original_title && film.original_title) {
      existing.original_title = film.original_title;
    }
  }

  return [...byIdentity.values()].sort((a, b) => {
    const yearCmp = (a.year ?? 0) - (b.year ?? 0);
    if (yearCmp !== 0) return yearCmp;
    return String(a.title).localeCompare(String(b.title));
  });
}

/**
 * @param {object} featureRow
 */
export function toDiscoveryMinimalFilm(featureRow) {
  return {
    title: featureRow.title,
    original_title: featureRow.original_title ?? null,
    year: featureRow.year,
    directors: [...featureRow.directors],
    countries: [...featureRow.countries],
    runtime_minutes: featureRow.runtime_minutes,
  };
}

/**
 * @param {object[]} featureRows
 * @param {string} [batchName]
 */
export function buildAnnecyCombinedSeedBatch(
  featureRows,
  batchName = "annecy-2012-2024"
) {
  return {
    batch_name: batchName,
    films: featureRows.map(toDiscoveryMinimalFilm),
  };
}
