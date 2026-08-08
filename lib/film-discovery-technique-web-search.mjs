/**
 * Technique web search: discover production-method pages, then let callers
 * extract evidence with TECHNIQUE_EVIDENCE_PATTERNS.
 *
 * Primary: site search on animation editorial hosts (Cartoon Brew, Animation
 * Magazine). DuckDuckGo HTML is optional fallback — often returns a challenge
 * page with no results from datacenter IPs.
 *
 * Does NOT invent technique from search snippets alone.
 */

import { fetchOfficialPageText } from "./festival-official-verification.mjs";

const DDG_HTML = "https://html.duckduckgo.com/html/";
const DEFAULT_DELAY_MS = 2500;
const DEFAULT_BUDGET = 30;
const DEFAULT_MAX_URLS = 4;

/** @type {Array<{ id: string, kind: string, buildSearchUrl: (q: string) => string, articleRe: RegExp }>} */
const SITE_SEARCH_PROVIDERS = [
  {
    id: "cartoonbrew",
    kind: "animation_editorial",
    buildSearchUrl: (q) =>
      `https://www.cartoonbrew.com/?s=${encodeURIComponent(q)}`,
    articleRe:
      /https?:\/\/(?:www\.)?cartoonbrew\.com\/(?:[a-z0-9-]+\/)+[a-z0-9-]+-\d+\.html/gi,
  },
  {
    id: "animationmagazine",
    kind: "animation_editorial",
    buildSearchUrl: (q) =>
      `https://www.animationmagazine.net/?s=${encodeURIComponent(q)}`,
    articleRe:
      /https?:\/\/(?:www\.)?animationmagazine\.net\/(?:20\d{2}\/\d{2}\/)?[a-z0-9-]+(?:-[a-z0-9]+)*\/?/gi,
  },
];

const BLOCKED_HOST_RE =
  /(?:^|\.)(facebook|fb\.com|instagram|twitter|x\.com|tiktok|youtube|youtu\.be|google|amazon|apple|netflix|disney|hulu|primevideo|justwatch|rottentomatoes|metacritic|letterboxd|spotify|vimeo|wikipedia\.org|wikidata\.org|imdb\.com|themoviedb\.org)\./i;

const WEAK_HOST_RE =
  /(?:^|\.)(allocine\.fr|francetvinfo\.fr|leparisien\.fr|lexpress\.fr|telerama\.fr|la-croix\.com|boxofficemojo\.com|businesswire\.com|cision\.com)\./i;

const FESTIVAL_HOST_RE =
  /annecy|berlinale|berlin-film|cannes|venice|labiennale|sundance|bfi\.org|tiff\.|ottawa|zagreb|animafest|festival/i;

const ANIMATION_EDITORIAL_HOST_RE =
  /cartoonbrew|animationmagazine|awn\.com|skwigly|zippyframes|cartoonist/i;

const EDITORIAL_HOST_RE =
  /variety\.com|hollywoodreporter|deadline\.com|indiewire|screendaily|filmmakermagazine|criterion|mubi\.com/i;

/**
 * Soft per-batch search budget (1 provider fetch ≈ 1 request).
 * @param {{ budget?: number, delayMs?: number }} [options]
 */
export function createTechniqueWebSearchState(options = {}) {
  return {
    requests: 0,
    hits: 0,
    errors: 0,
    rateLimited: false,
    stopped: false,
    budget: options.budget ?? DEFAULT_BUDGET,
    delayMs: options.delayMs ?? DEFAULT_DELAY_MS,
    cache: new Map(),
  };
}

/**
 * @param {object | null | undefined} state
 */
export function isTechniqueWebSearchStopped(state) {
  return Boolean(state?.stopped || state?.rateLimited);
}

const TITLE_STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "film",
  "movie",
  "with",
  "from",
  "that",
  "this",
  "into",
  "city",
  "boys",
  "girl",
  "girls",
  "world",
  "story",
  "road",
  "love",
  "life",
  "last",
  "dark",
  "night",
  "time",
  "part",
  "volume",
  "feature",
  "animation",
]);

/**
 * @param {string} title
 */
export function titleTokensForMatch(title) {
  const cleaned = String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const tokens = cleaned.filter(
    (t) => t.length >= 4 && !TITLE_STOPWORDS.has(t)
  );
  if (tokens.length) return tokens;
  const compact = cleaned.join("");
  return compact.length >= 6 ? [compact] : cleaned.filter((t) => t.length >= 3);
}

/**
 * @param {string} hay
 * @param {string} token
 */
function pathContainsToken(hay, token) {
  const re = new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`, "i");
  if (re.test(hay)) return true;
  // Compact titles: "catcity" should match "cat-city".
  if (!token.includes("-") && token.length >= 6) {
    const collapsed = hay.replace(/[^a-z0-9]+/g, "");
    return collapsed.includes(token);
  }
  return false;
}

/**
 * @param {string} url
 * @param {string} title
 */
export function urlLikelyAboutTitle(url, title) {
  const tokens = titleTokensForMatch(title);
  if (!tokens.length) return false;
  let hay = "";
  try {
    const parsed = new URL(url);
    if (/\/wp-content\/uploads\//i.test(parsed.pathname)) return false;
    if (/\/wordpress\//i.test(parsed.pathname)) return false;
    hay = `${parsed.pathname} ${parsed.search}`.toLowerCase();
  } catch {
    hay = String(url ?? "").toLowerCase();
  }
  const hits = tokens.filter((token) => pathContainsToken(hay, token));
  if (!hits.length) return false;
  if (tokens.length <= 2) return hits.length === tokens.length;
  return hits.length >= Math.ceil(tokens.length * 0.6);
}

/**
 * Site-search queries (short — better for WordPress `?s=`).
 * @param {{ title: string, year?: number | null, directors?: string[] }} film
 * @returns {string[]}
 */
export function buildTechniqueSearchQueries(film) {
  const title = String(film?.title ?? "").trim();
  if (!title) return [];
  const director = Array.isArray(film?.directors)
    ? String(film.directors[0] ?? "").trim()
    : "";
  /** @type {string[]} */
  const queries = [title];
  if (director) queries.push(`${title} ${director}`);
  return queries;
}

/**
 * Broader boolean query for DuckDuckGo / general engines.
 * @param {{ title: string, year?: number | null }} film
 */
export function buildTechniqueBooleanQuery(film) {
  const title = String(film?.title ?? "").trim();
  if (!title) return "";
  const year = film?.year ? String(film.year) : "";
  const terms =
    '(rotoscope OR rotoscoping OR "stop-motion" OR "stop motion" OR "hand-drawn" OR "cut-out" OR claymation OR "oil paint" OR "puppet animation" OR "animated documentary" OR technique)';
  return year ? `"${title}" ${year} ${terms}` : `"${title}" ${terms}`;
}

/**
 * Unwrap DuckDuckGo redirect links (`uddg=`) into destination URLs.
 * @param {string} href
 */
export function unwrapDuckDuckGoUrl(href) {
  const raw = String(href ?? "").trim().replace(/&amp;/g, "&");
  if (!raw) return null;
  try {
    const parsed = new URL(raw, "https://duckduckgo.com");
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) {
      const decoded = decodeURIComponent(uddg);
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    if (
      /^https?:\/\//i.test(parsed.href) &&
      !/duckduckgo\.com/i.test(parsed.hostname)
    ) {
      return parsed.href;
    }
  } catch {
    // fall through
  }
  if (/^https?:\/\//i.test(raw) && !/duckduckgo\.com/i.test(raw)) return raw;
  return null;
}

/**
 * @param {string} url
 * @returns {"festival" | "studio_or_film" | "animation_editorial" | "editorial" | "rejected"}
 */
export function classifyTechniqueSearchUrlKind(url) {
  if (!/^https?:\/\/\S+$/i.test(String(url ?? "").trim())) return "rejected";
  let host = "";
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    path = `${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return "rejected";
  }
  if (BLOCKED_HOST_RE.test(`.${host}.`)) return "rejected";
  if (WEAK_HOST_RE.test(`.${host}.`)) return "rejected";
  if (/box-office|boxoffice|\/search\/|\/category\/|\/tag\//i.test(path)) {
    return "rejected";
  }

  if (
    FESTIVAL_HOST_RE.test(host) ||
    /\/(festival|festivals)\b|official-selection|\/programme\/|\/program\//i.test(
      path
    )
  ) {
    return "festival";
  }
  if (ANIMATION_EDITORIAL_HOST_RE.test(host)) return "animation_editorial";
  if (EDITORIAL_HOST_RE.test(host)) return "editorial";
  if (
    /presskit|press-kit|mediakit|media-kit/i.test(path) ||
    /\/films?\/|\/film\/|\/movie\//i.test(path)
  ) {
    return "studio_or_film";
  }
  return "rejected";
}

/**
 * @param {string} url
 */
export function isTechniqueSearchAllowlistedUrl(url) {
  const kind = classifyTechniqueSearchUrlKind(url);
  return (
    kind === "festival" ||
    kind === "studio_or_film" ||
    kind === "animation_editorial" ||
    kind === "editorial"
  );
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractUrlsFromDuckDuckGoHtml(html) {
  const body = String(html ?? "");
  if (!/uddg=|result__a|class="result/i.test(body)) return [];
  const hrefs = body.match(/href=["']([^"']+)["']/gi) ?? [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const raw of hrefs) {
    const match = raw.match(/href=["']([^"']+)["']/i);
    if (!match?.[1]) continue;
    const unwrapped = unwrapDuckDuckGoUrl(match[1]);
    if (!unwrapped || !isTechniqueSearchAllowlistedUrl(unwrapped)) continue;
    const key = unwrapped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(unwrapped);
  }
  return out;
}

/**
 * @param {string} html
 * @param {RegExp} articleRe
 * @param {string} title
 */
export function extractArticleUrlsFromSiteSearchHtml(html, articleRe, title) {
  const matches = String(html ?? "").match(articleRe) ?? [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const raw of matches) {
    const url = raw.replace(/&amp;/g, "&").replace(/[\\]+$/g, "");
    if (!isTechniqueSearchAllowlistedUrl(url)) continue;
    if (!urlLikelyAboutTitle(url, title)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

/**
 * @param {string} url
 */
export function techniqueSearchUrlRank(url) {
  switch (classifyTechniqueSearchUrlKind(url)) {
    case "animation_editorial":
      return 0;
    case "festival":
      return 1;
    case "studio_or_film":
      return 2;
    case "editorial":
      return 3;
    default:
      return 9;
  }
}

/**
 * @param {object} state
 * @param {number} delayMs
 */
async function pacedFetchHtml(url, state, fetchImpl, delayMs) {
  if (isTechniqueWebSearchStopped(state)) return null;
  if (state.requests >= state.budget) {
    state.stopped = true;
    return null;
  }
  if (state.cache.has(url)) return state.cache.get(url);

  state.requests += 1;
  try {
    const html = await fetchOfficialPageText(url, {
      fetchImpl,
      timeoutMs: 12000,
    });
    state.cache.set(url, html);
    if (delayMs > 0) await sleep(delayMs);
    return html;
  } catch (error) {
    state.errors += 1;
    if (/rate.?limit|429|503/i.test(String(error?.message ?? ""))) {
      state.rateLimited = true;
      state.stopped = true;
    }
    state.cache.set(url, null);
    if (delayMs > 0) await sleep(delayMs);
    return null;
  }
}

/**
 * @deprecated Prefer discoverTechniqueUrlsViaWebSearch; kept for tests.
 * @param {string} query
 * @param {{ fetchImpl?: typeof fetch, state?: object, delayMs?: number }} [options]
 */
export async function searchTechniqueCandidateUrls(query, options = {}) {
  const state = options.state ?? createTechniqueWebSearchState();
  const delayMs = options.delayMs ?? state.delayMs ?? DEFAULT_DELAY_MS;
  const url = `${DDG_HTML}?q=${encodeURIComponent(query)}`;
  const html = await pacedFetchHtml(url, state, options.fetchImpl ?? fetch, delayMs);
  if (!html) return [];
  if (/429|too many requests|rate.?limit/i.test(html.slice(0, 2000))) {
    state.rateLimited = true;
    state.stopped = true;
    state.errors += 1;
    return [];
  }
  const urls = extractUrlsFromDuckDuckGoHtml(html)
    .sort((a, b) => techniqueSearchUrlRank(a) - techniqueSearchUrlRank(b))
    .slice(0, DEFAULT_MAX_URLS);
  if (urls.length) state.hits += 1;
  return urls;
}

/**
 * Discover technique research URLs for one film.
 * @param {{ title: string, year?: number | null, directors?: string[], source_urls?: string[] }} film
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   state?: object,
 *   delayMs?: number,
 *   enabled?: boolean,
 *   enableDuckDuckGo?: boolean,
 *   excludeUrls?: string[],
 *   maxProviders?: number,
 * }} [options]
 */
export async function discoverTechniqueUrlsViaWebSearch(film, options = {}) {
  if (options.enabled === false) {
    return {
      urls: [],
      researchNotes: ["web_search_disabled"],
      queries: [],
    };
  }

  const state = options.state ?? createTechniqueWebSearchState();
  if (isTechniqueWebSearchStopped(state)) {
    return {
      urls: [],
      researchNotes: [
        state.rateLimited
          ? "web_search_rate_limited"
          : "web_search_budget_exhausted",
      ],
      queries: [],
    };
  }

  const queries = buildTechniqueSearchQueries(film);
  const query = queries[0];
  if (!query) {
    return { urls: [], researchNotes: ["web_search_no_query"], queries: [] };
  }

  const exclude = new Set(
    [...(options.excludeUrls ?? []), ...(film.source_urls ?? [])].map((u) =>
      String(u).toLowerCase()
    )
  );
  const delayMs = options.delayMs ?? state.delayMs ?? DEFAULT_DELAY_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  /** @type {string[]} */
  const discovered = [];
  /** @type {string[]} */
  const notes = [];

  const providers = SITE_SEARCH_PROVIDERS.slice(0, options.maxProviders ?? 2);
  for (const provider of providers) {
    if (isTechniqueWebSearchStopped(state)) break;
    const searchUrl = provider.buildSearchUrl(query);
    const html = await pacedFetchHtml(searchUrl, state, fetchImpl, delayMs);
    if (!html) {
      notes.push(`web_search_${provider.id}_empty`);
      continue;
    }
    const urls = extractArticleUrlsFromSiteSearchHtml(
      html,
      provider.articleRe,
      film.title
    );
    if (!urls.length) {
      notes.push(`web_search_${provider.id}_no_title_match`);
      continue;
    }
    state.hits += 1;
    notes.push(`web_search_${provider.id}_urls:${urls.length}`);
    for (const url of urls) {
      if (exclude.has(url.toLowerCase())) continue;
      discovered.push(url);
    }
  }

  // Optional DDG fallback when site search found nothing.
  if (!discovered.length && options.enableDuckDuckGo === true) {
    const booleanQuery = buildTechniqueBooleanQuery(film);
    const ddgUrls = await searchTechniqueCandidateUrls(booleanQuery, {
      fetchImpl,
      state,
      delayMs,
    });
    if (!ddgUrls.length) {
      notes.push("web_search_ddg_no_results");
    } else {
      notes.push(`web_search_ddg_urls:${ddgUrls.length}`);
      for (const url of ddgUrls) {
        if (exclude.has(url.toLowerCase())) continue;
        if (!urlLikelyAboutTitle(url, film.title)) continue;
        discovered.push(url);
      }
    }
  }

  if (!discovered.length && !notes.some((n) => /web_search_/.test(n))) {
    notes.push("web_search_no_allowlisted_urls");
  } else if (!discovered.length) {
    notes.push("web_search_no_allowlisted_urls");
  } else {
    notes.push(`web_search_urls:${discovered.length}`);
  }

  const ranked = [...new Set(discovered)]
    .sort((a, b) => techniqueSearchUrlRank(a) - techniqueSearchUrlRank(b))
    .slice(0, DEFAULT_MAX_URLS);

  return {
    urls: ranked,
    researchNotes: notes,
    queries: [query],
  };
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
