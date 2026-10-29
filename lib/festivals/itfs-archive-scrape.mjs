/**
 * Parse ITFS Stuttgart film index + film detail pages.
 * Network I/O lives in scripts/scrape-itfs-archive.mjs.
 *
 * Archive index (from 2025): https://itfs.de/en/festival/index/
 * Feature filter: length[]=langfilm; editions: 197=2025, 3736=2026.
 */

import { DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES } from "../film-discovery.mjs";
import { normalizeFilmString } from "../film-duplicate-check.mjs";

export const ITFS_BASE = "https://itfs.de";
export const ITFS_USER_AGENT =
  "ResonaleItfsScrape/1.0 (+https://resonale.com; festival archive import)";

export const ITFS_FEATURE_MIN_RUNTIME_MINUTES =
  DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES;

/** WordPress edition term IDs on the film index. */
export const ITFS_EDITION_IDS = {
  2025: 197,
  2026: 3736,
};

/**
 * @param {number[]} years
 */
export function itfsLangfilmIndexUrl(years) {
  const params = new URLSearchParams();
  for (const year of years) {
    const editionId = ITFS_EDITION_IDS[year];
    if (!editionId) {
      throw new Error(`Unknown ITFS edition year: ${year}`);
    }
    params.append("edition[]", String(editionId));
  }
  params.append("length[]", "langfilm");
  return `${ITFS_BASE}/en/festival/index/?${params.toString()}`;
}

/**
 * @param {string} slug — path segment under /en/film/
 */
export function itfsFilmDetailUrl(slug) {
  const cleaned = String(slug ?? "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^en\/film\//i, "");
  return `${ITFS_BASE}/en/film/${cleaned}/`;
}

/**
 * Decode common HTML entities and collapse whitespace.
 * @param {string} value
 */
export function cleanItfsText(value) {
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
 * Parse "73 min", "69:27 min", "81:51 min" → whole minutes (seconds discarded).
 * @param {string} value
 * @returns {number | null}
 */
export function parseItfsRuntime(value) {
  const match = cleanItfsText(value).match(/^(\d+)(?::(\d{2}))?\s*min$/i);
  if (!match) return null;
  const minutes = Number.parseInt(match[1], 10);
  const seconds = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    !Number.isInteger(seconds) ||
    seconds > 59
  ) {
    return null;
  }
  return minutes;
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function splitItfsDirectorNames(raw) {
  const cleaned = cleanItfsText(raw.replace(/<[^>]+>/g, " "));
  if (!cleaned) return [];
  return cleaned
    .split(/\s*(?:,|;| & | and )\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function splitItfsCountries(raw) {
  const cleaned = cleanItfsText(raw);
  if (!cleaned) return [];
  return cleaned
    .split(",")
    .map((country) => country.trim())
    .filter(Boolean);
}

/**
 * Parse "ITFS 2026" section label → festival year.
 * @param {string} value
 * @returns {number | null}
 */
export function parseItfsFestivalYearLabel(value) {
  const match = cleanItfsText(value).match(/^ITFS\s+(\d{4})$/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

/**
 * Index meta line examples:
 *   "2025 · Zaven Najjar · Canada, France · 73 min · French"
 *   "1926 · Lotte Reiniger, Carl Koch · Germany · 65 min"
 *   "Filip Mašek · Czech Republic, Germany · 20 min · English"
 *   "25 min"
 * @param {string} meta
 */
export function parseItfsIndexMeta(meta) {
  const cleaned = cleanItfsText(meta);
  /** @type {number | null} */
  let year = null;
  /** @type {string[]} */
  let directors = [];
  /** @type {string[]} */
  let countries = [];
  /** @type {number | null} */
  let runtime_minutes = null;

  if (!cleaned) {
    return { year, directors, countries, runtime_minutes };
  }

  const runtimeMatch = cleaned.match(/(\d+(?::\d{2})?)\s*min(?:\s*·.*)?$/i);
  if (runtimeMatch) {
    runtime_minutes = parseItfsRuntime(`${runtimeMatch[1]} min`);
  }

  const withoutRuntime = cleaned
    .replace(/\s*·\s*[^·]*?\d+(?::\d{2})?\s*min(?:\s*·\s*.*)?$/i, "")
    .replace(/^\d+(?::\d{2})?\s*min$/i, "")
    .trim();
  if (!withoutRuntime) {
    return { year, directors, countries, runtime_minutes };
  }

  const parts = withoutRuntime
    .split(/\s*·\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { year, directors, countries, runtime_minutes };
  }

  let start = 0;
  if (/^\d{4}$/.test(parts[0])) {
    year = Number.parseInt(parts[0], 10);
    start = 1;
  }

  const rest = parts.slice(start);
  if (rest.length === 1) {
    // Ambiguous: director-only or country-only. Prefer director when it looks
    // like a person name (has lowercase letter / multiple words without known
    // country-only short forms). Fallback: treat as countries if comma list
    // or single known-looking place token without spaces… Keep simple:
    // one segment → directors if it has a space or lowercase letter mid-name,
    // else countries (e.g. "Kenya").
    const only = rest[0];
    if (/[a-zà-öø-ÿ]/.test(only) && /\s/.test(only)) {
      directors = splitItfsDirectorNames(only);
    } else if (/^[A-Z][A-Za-zÀ-žÉéÜüÖöÄä.\-\s]+$/.test(only) && !/\s/.test(only)) {
      countries = splitItfsCountries(only);
    } else {
      directors = splitItfsDirectorNames(only);
    }
  } else if (rest.length >= 2) {
    directors = splitItfsDirectorNames(rest[0]);
    countries = splitItfsCountries(rest[1]);
  }

  return { year, directors, countries, runtime_minutes };
}

/**
 * Film index rows (`filmindex-row film`).
 * @param {string} html
 * @returns {{
 *   id: string,
 *   slug: string,
 *   sourceUrl: string,
 *   listTitle: string,
 *   originalTitle: string | null,
 *   festivalYear: number | null,
 *   year: number | null,
 *   directors: string[],
 *   countries: string[],
 *   runtime_minutes: number | null,
 * }[]}
 */
export function parseItfsFilmsListPage(html) {
  /** @type {ReturnType<typeof parseItfsFilmsListPage>} */
  const rows = [];
  const re =
    /<a href="(https:\/\/itfs\.de\/en\/film\/([^"/]+)\/?)" class="filmindex-row film" data-id="(\d+)">([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(re)) {
    const sourceUrl = match[1].replace(/\/?$/, "/");
    const slug = match[2];
    const id = match[3];
    const body = match[4];

    const titleMatch = body.match(
      /class="filmindex-row-title"[^>]*>\s*([^<]+?)\s*</i
    );
    const listTitle = cleanItfsText(titleMatch?.[1] ?? "");
    if (!listTitle) continue;

    const originalMatch = body.match(
      /class="filmindex-row-original"[^>]*>\s*([^<]+?)\s*</i
    );
    let originalTitle = originalMatch
      ? cleanItfsText(originalMatch[1])
      : null;
    if (
      originalTitle &&
      normalizeFilmString(originalTitle) === normalizeFilmString(listTitle)
    ) {
      originalTitle = null;
    }

    const metaMatch = body.match(
      /class="filmindex-row-meta"[^>]*>\s*([^<]+?)\s*</i
    );
    const parsedMeta = parseItfsIndexMeta(metaMatch?.[1] ?? "");

    const sectionMatch = body.match(
      /class="filmindex-row-section"[^>]*>\s*([^<]+?)\s*</i
    );
    const festivalYear = parseItfsFestivalYearLabel(sectionMatch?.[1] ?? "");

    rows.push({
      id,
      slug,
      sourceUrl,
      listTitle,
      originalTitle,
      festivalYear,
      year: parsedMeta.year,
      directors: parsedMeta.directors,
      countries: parsedMeta.countries,
      runtime_minutes: parsedMeta.runtime_minutes,
    });
  }

  return rows;
}

/**
 * Labeled meta field: `<span class="label">Country:</span><span>…</span>`
 * @param {string} html
 * @param {string} label
 */
function extractItfsLabeledField(html, label) {
  const re = new RegExp(
    `<span class="label">\\s*${label}\\s*:\\s*</span>\\s*<span>([^<]*)</span>`,
    "i"
  );
  const match = html.match(re);
  return match ? cleanItfsText(match[1]) : null;
}

/**
 * @param {string} html
 * @param {{
 *   festivalYear: number,
 *   slug: string,
 *   id?: string | null,
 *   listTitle?: string | null,
 *   listOriginalTitle?: string | null,
 *   sourceUrl?: string | null,
 * }} context
 */
export function parseItfsFilmDetailPage(html, context) {
  const sourceUrl =
    context.sourceUrl ?? itfsFilmDetailUrl(context.slug);

  const titleMatch = html.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i);
  const title =
    cleanItfsText(titleMatch?.[1] ?? "") ||
    cleanItfsText(context.listTitle ?? "");

  const originalMatch = html.match(
    /<p class="original-title"[^>]*>\s*([^<]+?)\s*<\/p>/i
  );
  let original_title = originalMatch
    ? cleanItfsText(originalMatch[1])
    : context.listOriginalTitle
      ? cleanItfsText(context.listOriginalTitle)
      : null;
  if (
    original_title &&
    normalizeFilmString(original_title) === normalizeFilmString(title)
  ) {
    original_title = null;
  }

  const lengthMatch = html.match(
    /<div class="length">\s*<span>\s*([^<]+?)\s*<\/span>/i
  );
  /** @type {number | null} */
  let runtime_minutes = lengthMatch
    ? parseItfsRuntime(lengthMatch[1])
    : null;

  const countryRaw = extractItfsLabeledField(html, "Country");
  /** @type {string[]} */
  let countries = countryRaw ? splitItfsCountries(countryRaw) : [];

  const yearRaw = extractItfsLabeledField(html, "Year");
  /** @type {number | null} */
  let year = null;
  if (yearRaw && /^\d{4}$/.test(yearRaw)) {
    year = Number.parseInt(yearRaw, 10);
  }

  const typ = extractItfsLabeledField(html, "Typ");
  const genre = extractItfsLabeledField(html, "Genre");

  /** @type {string[]} */
  let directors = [];
  const directorMatch = html.match(
    /class="credit-group director"[^>]*>[\s\S]*?class="credit-names"[^>]*>\s*([^<]+?)\s*</i
  );
  if (directorMatch) {
    directors = splitItfsDirectorNames(directorMatch[1]);
  }

  /** @type {string | null} */
  let synopsis = null;
  const synopsisMatch = html.match(
    /<div class="text">\s*<p>([\s\S]*?)<\/p>/i
  );
  if (synopsisMatch) {
    synopsis =
      cleanItfsText(synopsisMatch[1].replace(/<[^>]+>/g, " ")) || null;
  }

  return {
    festival_year: context.festivalYear,
    slug: context.slug,
    itfs_id: context.id ?? null,
    list_title: context.listTitle ? cleanItfsText(context.listTitle) : null,
    title,
    original_title,
    year,
    runtime_minutes,
    directors,
    countries,
    typ: typ || null,
    genre: genre || null,
    synopsis,
    source_url: sourceUrl,
  };
}

/**
 * Merge list-row fallbacks into a detail parse when detail fields are sparse.
 * @param {object} detail
 * @param {{
 *   year?: number | null,
 *   directors?: string[],
 *   countries?: string[],
 *   runtime_minutes?: number | null,
 *   originalTitle?: string | null,
 * }} listRow
 */
export function mergeItfsListFallbacks(detail, listRow) {
  const out = { ...detail };
  if (!Number.isInteger(out.year) && Number.isInteger(listRow.year)) {
    out.year = listRow.year;
  }
  if (
    (!Array.isArray(out.directors) || out.directors.length === 0) &&
    Array.isArray(listRow.directors) &&
    listRow.directors.length > 0
  ) {
    out.directors = [...listRow.directors];
  }
  if (
    (!Array.isArray(out.countries) || out.countries.length === 0) &&
    Array.isArray(listRow.countries) &&
    listRow.countries.length > 0
  ) {
    out.countries = [...listRow.countries];
  }
  if (
    !Number.isInteger(out.runtime_minutes) &&
    Number.isInteger(listRow.runtime_minutes)
  ) {
    out.runtime_minutes = listRow.runtime_minutes;
  }
  if (
    !out.original_title &&
    listRow.originalTitle &&
    normalizeFilmString(listRow.originalTitle) !==
      normalizeFilmString(out.title ?? "")
  ) {
    out.original_title = cleanItfsText(listRow.originalTitle);
  }
  return out;
}

/**
 * @param {object} film
 */
export function isItfsFeatureFilm(film) {
  return (
    Number.isInteger(film?.runtime_minutes) &&
    film.runtime_minutes >= ITFS_FEATURE_MIN_RUNTIME_MINUTES
  );
}

/**
 * @param {{ title?: string | null, year?: number | null }} film
 */
export function itfsIdentityKey(film) {
  const title = normalizeFilmString(film?.title ?? "");
  const year = film?.year;
  if (!title || !Number.isInteger(year)) return null;
  return `${title}:${year}`;
}

/**
 * Keep feature-length films; one row per title+year (earliest festival year wins).
 * @param {object[]} films
 */
export function selectItfsFeatureSeedRows(films) {
  /** @type {Map<string, object>} */
  const byIdentity = new Map();

  for (const film of films) {
    if (!isItfsFeatureFilm(film)) continue;
    if (!film.title || !Number.isInteger(film.year)) continue;
    if (!Array.isArray(film.directors) || film.directors.length === 0) continue;
    if (!Array.isArray(film.countries) || film.countries.length === 0) continue;

    const key = itfsIdentityKey(film);
    if (!key) continue;

    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, {
        ...film,
        festival_years: [film.festival_year].filter((y) =>
          Number.isInteger(y)
        ),
      });
      continue;
    }

    const years = new Set(existing.festival_years ?? []);
    if (Number.isInteger(film.festival_year)) years.add(film.festival_year);
    existing.festival_years = [...years].sort((a, b) => a - b);

    if (
      Number.isInteger(film.festival_year) &&
      Number.isInteger(existing.festival_year) &&
      film.festival_year < existing.festival_year
    ) {
      existing.festival_year = film.festival_year;
      existing.source_url = film.source_url;
      existing.slug = film.slug;
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
 * @param {number} festivalYear
 * @param {object[]} featureRows
 */
export function buildItfsSeedBatch(festivalYear, featureRows) {
  const films = featureRows
    .filter((row) => row.festival_year === festivalYear)
    .map(toDiscoveryMinimalFilm);

  return {
    batch_name: `itfs-${festivalYear}`,
    films,
  };
}

/**
 * @param {object[]} featureRows
 * @param {string} [batchName]
 */
export function buildItfsCombinedSeedBatch(
  featureRows,
  batchName = "itfs-2025-2026"
) {
  return {
    batch_name: batchName,
    films: featureRows.map(toDiscoveryMinimalFilm),
  };
}
