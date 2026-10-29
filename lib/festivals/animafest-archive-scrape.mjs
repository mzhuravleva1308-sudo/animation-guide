/**
 * Parse Animafest Zagreb archive HTML (films index + film detail pages).
 * Network I/O lives in scripts/scrape-animafest-archive.mjs.
 */

import { DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES } from "../film-discovery.mjs";
import { normalizeFilmString } from "../film-duplicate-check.mjs";

export const ANIMAFEST_ARCHIVE_BASE = "https://www.animafest.hr/arhiva/en";
export const ANIMAFEST_LIVE_BASE = "https://www.animafest.hr/en";
export const ANIMAFEST_USER_AGENT =
  "ResonaleAnimafestScrape/1.0 (+https://resonale.com; festival archive import)";

export const ANIMAFEST_FEATURE_MIN_RUNTIME_MINUTES =
  DISCOVERY_MIN_FEATURE_RUNTIME_MINUTES;

/**
 * @param {number} year
 * @param {number} page
 */
export function animafestFilmsListUrl(year, page) {
  return `${ANIMAFEST_ARCHIVE_BASE}/${year}/films/${page}.html`;
}

/**
 * @param {number} year
 * @param {string} slug
 */
export function animafestFilmDetailUrl(year, slug) {
  return `${ANIMAFEST_ARCHIVE_BASE}/${year}/film/read_all/${slug}.html`;
}

/**
 * @param {number} page
 */
export function animafestLiveFilmsListUrl(page) {
  return `${ANIMAFEST_LIVE_BASE}/filmovi?page=${page}`;
}

/**
 * @param {string | number} id
 * @param {string} slug
 */
export function animafestLiveFilmDetailUrl(id, slug) {
  return `${ANIMAFEST_LIVE_BASE}/filmovi/${id}/${slug}`;
}

/**
 * Parse HH:MM:SS or H:MM:SS into minutes (rounded down).
 * @param {string} value
 * @returns {number | null}
 */
export function parseAnimafestRuntimeClock(value) {
  const match = String(value ?? "").trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  if (
    ![hours, minutes, seconds].every((n) => Number.isInteger(n) && n >= 0) ||
    minutes > 59 ||
    seconds > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * @param {string} html
 */
export function isAnimafestNotFoundPage(html) {
  return /rel="canonical"\s+href="https:\/\/www\.animafest\.hr\/hr\/404"/i.test(
    html
  );
}

/**
 * Decode common HTML entities and collapse whitespace.
 * @param {string} value
 */
export function cleanAnimafestText(value) {
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
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} html
 * @returns {{ slug: string, listTitle: string }[]}
 */
export function parseAnimafestFilmsListPage(html) {
  /** @type {Map<string, string>} */
  const bySlug = new Map();
  const re =
    /href="[^"]*film\/read(?:_all)?\/([a-z0-9_]+)\.html"[^>]*>\s*([^<]+)/gi;
  for (const match of html.matchAll(re)) {
    const slug = match[1];
    const listTitle = cleanAnimafestText(match[2]);
    if (!listTitle || /^(en|hr)$/i.test(listTitle)) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, listTitle);
  }
  return [...bySlug.entries()].map(([slug, listTitle]) => ({
    slug,
    listTitle,
  }));
}

/**
 * Split "Original / English" title line from a detail page.
 * @param {string} titleLine
 * @param {string | null} [listTitle]
 */
export function splitAnimafestTitleLine(titleLine, listTitle = null) {
  const cleaned = cleanAnimafestText(titleLine);
  if (!cleaned) {
    return {
      title: listTitle ? cleanAnimafestText(listTitle) : "",
      original_title: null,
    };
  }

  const parts = cleaned
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const left = parts[0];
    const right = parts[parts.length - 1];
    if (normalizeFilmString(left) === normalizeFilmString(right)) {
      const title = listTitle ? cleanAnimafestText(listTitle) : right;
      return { title, original_title: null };
    }
    const preferred =
      listTitle && cleanAnimafestText(listTitle)
        ? cleanAnimafestText(listTitle)
        : right;
    const original =
      normalizeFilmString(preferred) === normalizeFilmString(left)
        ? right
        : left;
    if (normalizeFilmString(preferred) === normalizeFilmString(original)) {
      return { title: preferred, original_title: null };
    }
    return { title: preferred, original_title: original };
  }

  return {
    title: listTitle ? cleanAnimafestText(listTitle) : cleaned,
    original_title: null,
  };
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function splitAnimafestDirectorNames(raw) {
  const cleaned = cleanAnimafestText(raw.replace(/<[^>]+>/g, " "));
  if (!cleaned) return [];
  return cleaned
    .split(/\s*(?:,|;| & | and )\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Live CMS film index (`/en/filmovi?page=N`).
 * @param {string} html
 * @returns {{ id: string, slug: string }[]}
 */
export function parseAnimafestLiveFilmsListPage(html) {
  /** @type {Map<string, { id: string, slug: string }>} */
  const byKey = new Map();
  const re = /\/en\/filmovi\/(\d+)\/([a-z0-9\-]+)/gi;
  for (const match of html.matchAll(re)) {
    const id = match[1];
    const slug = match[2];
    const key = `${id}/${slug}`;
    if (!byKey.has(key)) byKey.set(key, { id, slug });
  }
  return [...byKey.values()];
}

/**
 * Live CMS film detail (`/en/filmovi/{id}/{slug}`).
 * Meta line looks like: `Canada, France / 2025 / 01:15:00`.
 * @param {string} html
 * @param {{
 *   festivalYear: number,
 *   id: string,
 *   slug: string,
 *   sourceUrl?: string | null,
 * }} context
 */
export function parseAnimafestLiveFilmDetailPage(html, context) {
  const sourceUrl =
    context.sourceUrl ??
    animafestLiveFilmDetailUrl(context.id, context.slug);

  const titleMatch = html.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i);
  const title = cleanAnimafestText(titleMatch?.[1] ?? "");

  /** @type {string[]} */
  let directors = [];
  const directorMatch = html.match(
    /<div class="page-header">\s*<span>\s*([^<]+?)\s*<\/span>/i
  );
  if (directorMatch) {
    directors = splitAnimafestDirectorNames(directorMatch[1]);
  }
  if (directors.length === 0) {
    const labeled = html.match(/Director<\/[^>]+>\s*<[^>]+>\s*([^<]+)/i);
    if (labeled) directors = splitAnimafestDirectorNames(labeled[1]);
  }

  /** @type {string[]} */
  let countries = [];
  /** @type {number | null} */
  let year = null;
  /** @type {number | null} */
  let runtime_minutes = null;
  const metaMatch = html.match(
    /<div class="film-info">\s*<p>\s*([^<]+?)\s*<\/p>/i
  );
  if (metaMatch) {
    const parts = cleanAnimafestText(metaMatch[1])
      .split(/\s*\/\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      countries = parts[0]
        .split(",")
        .map((country) => country.trim())
        .filter(Boolean);
      const yearParsed = Number.parseInt(parts[1], 10);
      if (Number.isInteger(yearParsed)) year = yearParsed;
      runtime_minutes = parseAnimafestRuntimeClock(parts[2]);
    }
  }

  return {
    festival_year: context.festivalYear,
    slug: context.slug,
    live_id: context.id,
    list_title: title || null,
    title,
    original_title: null,
    year,
    runtime_minutes,
    directors,
    countries,
    section: null,
    synopsis: null,
    source_url: sourceUrl,
    source: "live_filmovi",
  };
}

/**
 * @param {string} html
 * @param {{
 *   festivalYear: number,
 *   slug: string,
 *   listTitle?: string | null,
 *   sourceUrl?: string | null,
 * }} context
 */
export function parseAnimafestFilmDetailPage(html, context) {
  const listTitle = context.listTitle ?? null;
  const sourceUrl =
    context.sourceUrl ??
    animafestFilmDetailUrl(context.festivalYear, context.slug);

  let titleLine = "";
  const titleMatch = html.match(
    /<p class="t-14 t-lcase t-smallcaps t-bld lh-16">\s*([^<]+?)\s*<\/p>/i
  );
  if (titleMatch) titleLine = titleMatch[1];
  const { title, original_title } = splitAnimafestTitleLine(
    titleLine,
    listTitle
  );

  /** @type {string[]} */
  let directors = [];
  const directorBlock = html.match(/Director<\/p>\s*<p>([\s\S]*?)<\/p>/i);
  if (directorBlock) {
    directors = splitAnimafestDirectorNames(directorBlock[1]);
  }
  if (directors.length === 0) {
    // Fallback: bold name line immediately above Country / year / runtime.
    const fallback = html.match(
      /<p class="t-14 t-lcase t-smallcaps t-bld">\s*([^<]+?)\s*<\/p>\s*([^<]+?)\s*\/\s*(\d{4})\s*\/\s*(\d+)'/i
    );
    if (fallback) {
      directors = splitAnimafestDirectorNames(fallback[1]);
    }
  }

  /** @type {string[]} */
  let countries = [];
  /** @type {number | null} */
  let year = null;
  /** @type {number | null} */
  let runtime_minutes = null;
  const metaMatch = html.match(
    /([A-Za-zÀ-žÉéÜüÖöÄäČčĆćŠšŽžİıÑñØøÅåÆæẞß.\-\s,]+?)\s*\/\s*(\d{4})\s*\/\s*(\d+)'\s*(?:\d+)''/
  );
  if (metaMatch) {
    countries = cleanAnimafestText(metaMatch[1])
      .split(",")
      .map((country) => country.trim())
      .filter(Boolean);
    year = Number.parseInt(metaMatch[2], 10);
    runtime_minutes = Number.parseInt(metaMatch[3], 10);
  }

  /** @type {string | null} */
  let section = null;
  const sectionMatch = html.match(
    /<p class="t-14 t-lcase t-smallcaps\s*"[^>]*>\s*<a href="[^"]*program\/[^"]+">([^<]+)<\/a>/i
  );
  if (sectionMatch) section = cleanAnimafestText(sectionMatch[1]);

  /** @type {string | null} */
  let synopsis = null;
  const synopsisMatch = html.match(
    /Synopsis<\/p>\s*(?:<br\s*\/?>\s*)*<p[^>]*>([\s\S]*?)<\/p>/i
  );
  if (synopsisMatch) {
    synopsis =
      cleanAnimafestText(synopsisMatch[1].replace(/<[^>]+>/g, " ")) || null;
  }

  return {
    festival_year: context.festivalYear,
    slug: context.slug,
    list_title: listTitle ? cleanAnimafestText(listTitle) : null,
    title,
    original_title,
    year,
    runtime_minutes,
    directors,
    countries,
    section,
    synopsis,
    source_url: sourceUrl,
  };
}

/**
 * @param {object} film — parsed detail row
 */
export function isAnimafestFeatureFilm(film) {
  return (
    Number.isInteger(film?.runtime_minutes) &&
    film.runtime_minutes >= ANIMAFEST_FEATURE_MIN_RUNTIME_MINUTES
  );
}

/**
 * Identity key for cross-year dedupe (title + film year).
 * @param {{ title?: string | null, year?: number | null }} film
 */
export function animafestIdentityKey(film) {
  const title = normalizeFilmString(film?.title ?? "");
  const year = film?.year;
  if (!title || !Number.isInteger(year)) return null;
  return `${title}:${year}`;
}

/**
 * Keep feature-length films; one row per title+year (earliest festival year wins,
 * later years recorded under festival_years).
 * @param {object[]} films
 */
export function selectAnimafestFeatureSeedRows(films) {
  /** @type {Map<string, object>} */
  const byIdentity = new Map();

  for (const film of films) {
    if (!isAnimafestFeatureFilm(film)) continue;
    if (!film.title || !Number.isInteger(film.year)) continue;
    if (!Array.isArray(film.directors) || film.directors.length === 0) continue;
    if (!Array.isArray(film.countries) || film.countries.length === 0) continue;

    const key = animafestIdentityKey(film);
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

    // Prefer richer directors/countries; keep earliest festival appearance URL.
    if (
      Number.isInteger(film.festival_year) &&
      Number.isInteger(existing.festival_year) &&
      film.festival_year < existing.festival_year
    ) {
      existing.festival_year = film.festival_year;
      existing.source_url = film.source_url;
      existing.slug = film.slug;
      existing.section = film.section ?? existing.section;
    }
    if (
      (film.directors?.length ?? 0) > (existing.directors?.length ?? 0)
    ) {
      existing.directors = film.directors;
    }
    if (
      (film.countries?.length ?? 0) > (existing.countries?.length ?? 0)
    ) {
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
 * Discovery-minimal film object (no forbidden extra fields).
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
 * @param {object[]} featureRows — already feature-filtered + complete
 */
export function buildAnimafestSeedBatch(festivalYear, featureRows) {
  const films = featureRows
    .filter((row) => row.festival_year === festivalYear)
    .map(toDiscoveryMinimalFilm);

  return {
    batch_name: `animafest-${festivalYear}`,
    films,
  };
}

/**
 * Cross-year feature list → one combined minimal batch (deduped).
 * @param {object[]} featureRows
 * @param {string} [batchName]
 */
export function buildAnimafestCombinedSeedBatch(
  featureRows,
  batchName = "animafest-2010-2026"
) {
  return {
    batch_name: batchName,
    films: featureRows.map(toDiscoveryMinimalFilm),
  };
}
