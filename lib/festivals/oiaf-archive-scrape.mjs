/**
 * Parse OIAF /archive/ Ninja Table (Award Winners / Programming Database embed).
 * Network I/O + TMDB enrichment live in scripts/scrape-oiaf-archive.mjs.
 *
 * Note: both page headings currently embed the same table (award winners).
 * Feature selection is by award name containing "feature".
 */

import { DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES } from "../film-discovery.mjs";
import { normalizeFilmString } from "../film-duplicate-check.mjs";

export const OIAF_ARCHIVE_URL = "https://www.animationfestival.ca/archive/";
export const OIAF_USER_AGENT =
  "ResonaleOiafScrape/1.0 (+https://resonale.com; festival archive import)";

export const OIAF_FEATURE_MIN_RUNTIME_MINUTES =
  DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES;

export const OIAF_NINJA_TABLE_ID = "244206";

/**
 * @param {string} value
 */
export function cleanOiafText(value) {
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
 * Award is a feature competition prize (Grand Prize / Best Animated Feature / etc.).
 * @param {string} award
 */
export function isOiafFeatureAward(award) {
  return /\bfeature\b/i.test(String(award ?? ""));
}

/**
 * Split "English (Original)" / "ORIGINAL (English)" style titles.
 * @param {string} rawTitle
 * @returns {{ title: string, original_title: string | null }}
 */
export function splitOiafTitle(rawTitle) {
  const cleaned = cleanOiafText(rawTitle).replace(/,\s*$/, "");
  const match = cleaned.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!match) {
    return { title: cleaned, original_title: null };
  }
  const outer = cleanOiafText(match[1]);
  const inner = cleanOiafText(match[2]);
  if (!outer || !inner) {
    return { title: cleaned, original_title: null };
  }
  // Prefer Latin/display title as `title`, other script / alternate as original.
  const outerLatin = /[A-Za-z]/.test(outer);
  const innerLatin = /[A-Za-z]/.test(inner);
  if (outerLatin && !innerLatin) {
    return { title: outer, original_title: inner };
  }
  if (!outerLatin && innerLatin) {
    return { title: inner, original_title: outer };
  }
  // Both Latin: keep outer as title, inner as original (common for EN (local)).
  return { title: outer, original_title: inner };
}

/**
 * Parse director credits that may embed countries:
 *   "Emma de Swaef and Marc James Roels (Belgium, France, Netherlands)"
 *   "Masaaki Yuasa, Japan"
 *   "Max Andersson & Helena Ahonen"
 * @param {string} raw
 * @returns {{ directors: string[], countries: string[] }}
 */
export function parseOiafDirectorCredit(raw) {
  let text = cleanOiafText(raw);
  /** @type {string[]} */
  const countries = [];

  const paren = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const maybeCountries = paren[2]
      .split(/[,;/]/)
      .map((part) => cleanOiafText(part))
      .filter(Boolean);
    if (
      maybeCountries.length > 0 &&
      maybeCountries.every((c) => looksLikeCountry(c))
    ) {
      countries.push(...maybeCountries);
      text = cleanOiafText(paren[1]);
    }
  }

  // Trailing ", Japan" / "; France"
  const trailing = text.match(/^(.*?),\s*([A-Z][A-Za-z .'-]+)$/);
  if (trailing && looksLikeCountry(trailing[2]) && !countries.length) {
    countries.push(cleanOiafText(trailing[2]));
    text = cleanOiafText(trailing[1]);
  }

  const directors = text
    .split(/\s*(?:,|&| and | \/ |;)\s*/i)
    .map((part) => cleanOiafText(part))
    .filter(Boolean)
    .filter((part) => !looksLikeCountry(part));

  return {
    directors: [...new Set(directors)],
    countries: [...new Set(countries)],
  };
}

/**
 * Heuristic: short proper-noun phrases that are countries, not people.
 * @param {string} value
 */
function looksLikeCountry(value) {
  const v = cleanOiafText(value);
  if (!v || v.length > 40) return false;
  if (/\d/.test(v)) return false;
  // Common festival country tokens / known list-ish pattern
  if (
    /^(japan|taiwan|belgium|france|netherlands|canada|usa|u\.?s\.?a\.?|united states|united kingdom|uk|germany|poland|russia|brazil|china|korea|south korea|spain|italy|sweden|norway|denmark|finland|switzerland|austria|portugal|ireland|australia|new zealand|mexico|argentina|chile|czech(?:oslovakia| republic)?|slovakia|hungary|romania|ukraine|israel|iran|india|thailand|vietnam|singapore|hong kong)$/i.test(
      v
    )
  ) {
    return true;
  }
  // Avoid treating multi-word director names as countries unless listed above
  return false;
}

/**
 * Strip tags from a table cell.
 * @param {string} html
 */
function cellText(html) {
  return cleanOiafText(String(html ?? "").replace(/<[^>]+>/g, " "));
}

/**
 * Parse all rows from the first Ninja Table tbody on the archive page.
 * @param {string} html
 * @returns {object[]}
 */
export function parseOiafArchiveTable(html) {
  const tableId = OIAF_NINJA_TABLE_ID;
  const tableStart = html.indexOf(`data-footable_id="${tableId}"`);
  if (tableStart < 0) {
    throw new Error(`OIAF Ninja Table ${tableId} not found in archive HTML`);
  }
  const tbodyStart = html.indexOf("<tbody>", tableStart);
  const tbodyEnd = html.indexOf("</tbody>", tbodyStart);
  if (tbodyStart < 0 || tbodyEnd < 0) {
    throw new Error("OIAF table tbody not found");
  }
  const tbody = html.slice(tbodyStart, tbodyEnd);
  /** @type {object[]} */
  const rows = [];

  for (const tr of tbody.matchAll(
    /<tr data-row_id="(\d+)"[^>]*>([\s\S]*?)<\/tr>/g
  )) {
    const rowId = tr[1];
    const inner = tr[2];
    const tds = [...inner.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
      (m) => m[1]
    );
    if (tds.length < 4) continue;

    const rawTitle = cellText(tds[0]);
    const award = cellText(tds[1]);
    const rawDirectors = cellText(tds[2]);
    const yearText = cellText(tds[3]);
    const festivalYear = Number.parseInt(yearText, 10);
    if (!rawTitle || !Number.isInteger(festivalYear)) continue;

    const { title, original_title } = splitOiafTitle(rawTitle);
    const { directors, countries } = parseOiafDirectorCredit(rawDirectors);

    let photoUrl = null;
    const photoMatch = inner.match(/"image_full":"([^"]+)"/);
    if (photoMatch) {
      photoUrl = photoMatch[1].replace(/\\\//g, "/");
    }

    rows.push({
      row_id: rowId,
      raw_title: rawTitle,
      title,
      original_title,
      award,
      directors,
      countries,
      festival_year: festivalYear,
      // Production year unknown until TMDB enrich
      year: null,
      runtime_minutes: null,
      photo_url: photoUrl,
      synopsis: tds.length > 5 ? cellText(tds[5]) : "",
      source_url: OIAF_ARCHIVE_URL,
    });
  }

  return rows;
}

/**
 * @param {object} row
 * @param {number} fromYear
 * @param {number} [toYear]
 */
export function isOiafFeatureSeedCandidate(row, fromYear, toYear = 2100) {
  if (!isOiafFeatureAward(row?.award)) return false;
  const fy = row?.festival_year;
  if (!Number.isInteger(fy) || fy < fromYear || fy > toYear) return false;
  if (!row?.title) return false;
  return true;
}

/**
 * @param {object[]} rows
 * @param {number} fromYear
 * @param {number} [toYear]
 */
export function selectOiafFeatureAwardRows(rows, fromYear, toYear = 2100) {
  /** @type {Map<string, object>} */
  const byTitle = new Map();
  for (const row of rows) {
    if (!isOiafFeatureSeedCandidate(row, fromYear, toYear)) continue;
    const key = normalizeFilmString(row.title);
    if (!key) continue;
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, {
        ...row,
        festival_years: [row.festival_year],
      });
      continue;
    }
    const years = new Set(existing.festival_years ?? []);
    years.add(row.festival_year);
    existing.festival_years = [...years].sort((a, b) => a - b);
    if (row.festival_year < existing.festival_year) {
      existing.festival_year = row.festival_year;
      existing.award = row.award;
    }
    if ((row.directors?.length ?? 0) > (existing.directors?.length ?? 0)) {
      existing.directors = row.directors;
    }
    if ((row.countries?.length ?? 0) > (existing.countries?.length ?? 0)) {
      existing.countries = row.countries;
    }
    if (!existing.original_title && row.original_title) {
      existing.original_title = row.original_title;
    }
  }

  return [...byTitle.values()].sort((a, b) => {
    const yearCmp = (a.festival_year ?? 0) - (b.festival_year ?? 0);
    if (yearCmp !== 0) return yearCmp;
    return String(a.title).localeCompare(String(b.title));
  });
}

/**
 * @param {object} film
 */
export function isOiafFeatureFilm(film) {
  return (
    Number.isInteger(film?.runtime_minutes) &&
    film.runtime_minutes >= OIAF_FEATURE_MIN_RUNTIME_MINUTES
  );
}

/**
 * Keep enriched feature-length rows ready for discovery-minimal seed.
 * @param {object[]} films
 */
export function selectOiafFeatureSeedRows(films) {
  /** @type {Map<string, object>} */
  const byIdentity = new Map();

  for (const film of films) {
    if (!isOiafFeatureFilm(film)) continue;
    if (!film.title || !Number.isInteger(film.year)) continue;
    if (!Array.isArray(film.directors) || film.directors.length === 0) continue;
    if (!Array.isArray(film.countries) || film.countries.length === 0) continue;

    const titleKey = normalizeFilmString(film.title);
    if (!titleKey) continue;
    const key = `${titleKey}:${film.year}`;
    if (!byIdentity.has(key)) {
      byIdentity.set(key, { ...film });
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
export function buildOiafCombinedSeedBatch(
  featureRows,
  batchName = "oiaf-2012-2021"
) {
  return {
    batch_name: batchName,
    films: featureRows.map(toDiscoveryMinimalFilm),
  };
}
