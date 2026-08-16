/**
 * Source URL enricher for discovery candidates that were seeded without URLs.
 *
 * Target URL kinds (in priority order):
 * 1) festival programme / selection pages
 * 2) studio / official film pages (incl. TMDB homepage, press kits)
 * 3) animation-trade editorial (Cartoon Brew, AWN, …)
 *
 * Collects only verifiable candidates:
 * - TMDB movie homepage
 * - External links from an identity-verified Wikipedia page
 *
 * Never invents URLs via LLM.
 */

import { findTmdbMatchForCandidate } from "./film-discovery-media.mjs";
import { fetchTmdbMovieDetails } from "./tmdb-film-matching.mjs";
import {
  classifySourceUrlTier,
  createWikipediaResearchState,
  fetchWikipediaContentResearch,
  SOURCE_TIERS,
} from "./film-discovery-content-research.mjs";
import { normalizeSourceUrls } from "./film-discovery-eligibility.mjs";

const BLOCKED_HOST_RE =
  /(?:^|\.)(facebook|fb\.com|instagram|twitter|x\.com|tiktok|youtube|youtu\.be|google|amazon|apple|netflix|disney|hulu|primevideo|justwatch|rottentomatoes|metacritic|letterboxd|spotify|vimeo)\./i;

/** Listing / box-office / generic news — usually weak for technique research. */
const WEAK_HOST_RE =
  /(?:^|\.)(allocine\.fr|francetvinfo\.fr|leparisien\.fr|lexpress\.fr|telerama\.fr|la-croix\.com|cbs\d|cision\.com|businesswire\.com|boxofficemojo\.com)\./i;

const FESTIVAL_HOST_RE =
  /annecy|berlinale|berlin-film|cannes|venice|labiennale|sundance|bfi\.org|tiff\.|tokyo-filmex|sitges|ottawa|zagreb|animafest|festival/i;

const ANIMATION_EDITORIAL_HOST_RE =
  /cartoonbrew|animationmagazine|awn\.com|skwigly|zippyframes|cartoonist/i;

const MAX_SOURCE_URLS = 3;

/**
 * @param {string} url
 */
export function isBlockedSourceHost(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return BLOCKED_HOST_RE.test(`.${host}.`);
  } catch {
    return true;
  }
}

/**
 * @param {string} url
 * @returns {"festival" | "studio_or_film" | "animation_editorial" | "editorial" | "weak" | "rejected"}
 */
export function classifySourceUrlKind(url) {
  if (!/^https?:\/\/\S+$/i.test(String(url ?? "").trim())) return "rejected";
  if (isBlockedSourceHost(url)) return "rejected";
  const tier = classifySourceUrlTier(url);
  if (tier == null) return "rejected";

  let host = "";
  let path = "";
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    path = `${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return "rejected";
  }

  if (WEAK_HOST_RE.test(`.${host}.`)) return "weak";
  if (/box-office|boxoffice/i.test(path)) return "weak";

  if (
    FESTIVAL_HOST_RE.test(host) ||
    /\/(festival|festivals)\b|official-selection|\/programme\/|\/program\//i.test(
      path
    )
  ) {
    return "festival";
  }

  if (
    /presskit|press-kit|mediakit|media-kit|official/i.test(host) ||
    /presskit|press-kit|mediakit|media-kit/i.test(path) ||
    /\/films?\/|\/film\/|\/movie\//i.test(path)
  ) {
    return "studio_or_film";
  }

  if (ANIMATION_EDITORIAL_HOST_RE.test(host)) return "animation_editorial";

  // TMDB homepage / unknown studio domains land as editorial tier from classifier.
  if (tier === SOURCE_TIERS.official) return "studio_or_film";

  return "editorial";
}

/**
 * Keep URLs useful for technique / production research.
 * @param {string} url
 */
export function isUsefulSourceUrl(url) {
  const kind = classifySourceUrlKind(url);
  return (
    kind === "festival" ||
    kind === "studio_or_film" ||
    kind === "animation_editorial" ||
    kind === "editorial"
  );
}

/**
 * Lower is better.
 * @param {string} url
 */
export function sourceUrlRank(url) {
  switch (classifySourceUrlKind(url)) {
    case "festival":
      return 0;
    case "studio_or_film":
      return 1;
    case "animation_editorial":
      return 2;
    case "editorial":
      return 3;
    case "weak":
      return 8;
    default:
      return 9;
  }
}

/**
 * Prefer a mix: festival + studio/film + animation editorial when available.
 * @param {string[]} urls
 * @param {{ max?: number }} [options]
 */
export function selectSourceUrls(urls, options = {}) {
  const max = options.max ?? MAX_SOURCE_URLS;
  const normalized = normalizeSourceUrls(urls).filter(isUsefulSourceUrl);
  const ranked = [...normalized].sort((a, b) => {
    const rankDiff = sourceUrlRank(a) - sourceUrlRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b);
  });

  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const usedKinds = new Set();

  const push = (url) => {
    const key = url.toLowerCase().replace(/\/$/, "");
    if (seen.has(key) || out.length >= max) return false;
    seen.add(key);
    out.push(url);
    usedKinds.add(classifySourceUrlKind(url));
    return true;
  };

  // First pass: one of each high-value kind.
  for (const want of ["festival", "studio_or_film", "animation_editorial"]) {
    const hit = ranked.find((url) => classifySourceUrlKind(url) === want);
    if (hit) push(hit);
  }
  // Fill remaining slots by rank.
  for (const url of ranked) {
    if (out.length >= max) break;
    push(url);
  }
  return out;
}

/**
 * Soft reachability check — accept 2xx/3xx.
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function probeSourceUrl(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 8000
  );
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "ResonaleFilmDiscoverySourceEnricher/1.0 (source url probe)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Enrich one candidate with source URLs (does not write to DB).
 * @param {object} candidate
 * @param {{
 *   tmdbApiKey?: string,
 *   fetchImpl?: typeof fetch,
 *   enableWikipedia?: boolean,
 *   enableProbe?: boolean,
 *   wikipediaState?: object,
 *   maxUrls?: number,
 * }} [options]
 */
export async function enrichCandidateSourceUrls(candidate, options = {}) {
  /** @type {string[]} */
  const discovered = [];
  /** @type {string[]} */
  const notes = [];
  const existing = normalizeSourceUrls(candidate.source_urls);
  if (existing.length) {
    return {
      source_urls: selectSourceUrls(existing, { max: options.maxUrls }),
      changed: false,
      notes: ["already_had_source_urls"],
      discovered: existing,
    };
  }

  const identity = {
    title: candidate.title,
    original_title: candidate.original_title ?? null,
    year: candidate.year ?? null,
    directors: Array.isArray(candidate.directors) ? candidate.directors : [],
    director: Array.isArray(candidate.directors)
      ? candidate.directors.join(", ")
      : null,
  };

  // 1) TMDB homepage
  if (options.tmdbApiKey) {
    try {
      const fetchDetails =
        options.fetchDetails ??
        (async (apiKey, movieId, appendToResponse = "credits", detailOpts = {}) => {
          if (!options.fetchImpl) {
            return fetchTmdbMovieDetails(apiKey, movieId, appendToResponse, detailOpts);
          }
          const params = new URLSearchParams({
            api_key: apiKey,
            append_to_response: appendToResponse,
          });
          if (detailOpts.includeVideoLanguage) {
            params.set("include_video_language", detailOpts.includeVideoLanguage);
          }
          const response = await options.fetchImpl(
            `https://api.themoviedb.org/3/movie/${movieId}?${params.toString()}`
          );
          if (!response.ok) {
            throw new Error(`TMDB details failed for ${movieId}: ${response.status}`);
          }
          const data = await response.json();
          return {
            ...data,
            director_names: (data.credits?.crew ?? [])
              .filter((member) => member.job === "Director")
              .map((member) => member.name),
          };
        });

      const resolved = await findTmdbMatchForCandidate(identity, {
        tmdbApiKey: options.tmdbApiKey,
        fetchImpl: options.fetchImpl,
        fetchDetails,
      });
      const homepage = resolved.match?.homepage;
      if (homepage && isUsefulSourceUrl(homepage)) {
        discovered.push(homepage);
        notes.push("tmdb_homepage");
      } else if (resolved.match?.id) {
        notes.push("tmdb_match_without_homepage");
      } else {
        notes.push("tmdb_no_match");
      }
    } catch {
      notes.push("tmdb_error");
    }
  }

  // 2) Wikipedia external links — also when we still lack festival or studio/film pages.
  const kindsHave = new Set(
    discovered.filter(isUsefulSourceUrl).map((url) => classifySourceUrlKind(url))
  );
  const needsWiki =
    options.enableWikipedia !== false &&
    (!kindsHave.has("festival") || !kindsHave.has("studio_or_film"));

  if (needsWiki) {
    const wikipediaState =
      options.wikipediaState ??
      createWikipediaResearchState({ delayMs: options.delayMs });
    try {
      const wiki = await fetchWikipediaContentResearch(identity, {
        fetchImpl: options.fetchImpl,
        enabled: true,
        state: wikipediaState,
        delayMs: wikipediaState.delayMs,
      });
      if (wiki.page?.title) {
        // Combined page fetch already includes extlinks — no second Wikipedia call.
        const extlinks = Array.isArray(wiki.page.extlinks) ? wiki.page.extlinks : [];
        const useful = extlinks.filter(isUsefulSourceUrl);
        discovered.push(...useful);
        notes.push(
          useful.length
            ? `wikipedia_extlinks:${useful.length}`
            : "wikipedia_extlinks_none_useful"
        );
      } else {
        notes.push(wiki.reason ? `wikipedia_${wiki.reason}` : "wikipedia_no_page");
      }
    } catch (error) {
      notes.push(
        error?.code === "wikipedia_rate_limited" ||
          /rate_limited/i.test(String(error?.message ?? ""))
          ? "wikipedia_rate_limited"
          : "wikipedia_error"
      );
    }
  } else if (options.enableWikipedia !== false) {
    notes.push("wikipedia_skipped_have_festival_and_studio");
  }

  let selected = selectSourceUrls(discovered, { max: options.maxUrls });

  if (options.enableProbe !== false && selected.length) {
    /** @type {string[]} */
    const reachable = [];
    for (const url of selected) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await probeSourceUrl(url, { fetchImpl: options.fetchImpl });
      if (ok) reachable.push(url);
      else notes.push(`unreachable:${url}`);
    }
    selected = reachable;
  }

  return {
    source_urls: selected,
    changed: selected.length > 0,
    notes,
    discovered: selectSourceUrls(discovered, { max: 10 }),
  };
}
