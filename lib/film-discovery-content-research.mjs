/**
 * Factual research helpers for discovery Content curator.
 *
 * Technique evidence priority:
 * 1) candidate.source_urls (official / festival / press / production)
 * 2) TMDB — overview explicit wording + structured movie keywords
 * 3) Wikipedia — fallback only when 1–2 lack sufficient evidence
 *
 * Wikipedia is never the default primary source and must not feed creative copy.
 */

import { fetchOfficialPageText } from "./festival-official-verification.mjs";
import {
  isDistinctiveTechniqueLabel,
  preferEvidenceBackedTechniqueLabels,
} from "./film-discovery-technique.mjs";
import {
  createTechniqueWebSearchState,
  discoverTechniqueUrlsViaWebSearch,
} from "./film-discovery-technique-web-search.mjs";
import { inferTechniqueViaAi } from "./film-discovery-technique-ai.mjs";

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT =
  "ResonaleFilmDiscovery/1.0 (weekly discovery technique/source research; contact: https://github.com/mzhuravleva1308-sudo/animation-guide)";
/** Soft default: ~1 Wikipedia round-trip every 8s when not overridden by tests. */
const DEFAULT_DELAY_MS = 8000;
const WIKIPEDIA_TIMEOUT_MS = 12000;
/** Soft batch ceiling — prefer drip over exhausting a large budget. */
const DEFAULT_WIKIPEDIA_BUDGET = 40;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 60000;

/** @type {"official" | "editorial" | "tmdb" | "wikipedia" | "ai"} */
export const SOURCE_TIERS = Object.freeze({
  official: "official",
  editorial: "editorial",
  tmdb: "tmdb",
  wikipedia: "wikipedia",
  ai: "ai",
});

const TIER_CONFIDENCE = Object.freeze({
  official: 0.92,
  editorial: 0.82,
  tmdb: 0.45,
  wikipedia: 0.5,
  ai: 0.4,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Patterns that map source wording → preferred catalog technique labels.
 * Order matters: more specific first.
 */
export const TECHNIQUE_EVIDENCE_PATTERNS = Object.freeze([
  {
    id: "rotoscope",
    re: /\brotoscop(?:e|ing|ed)\b/i,
    labels: ["rotoscope"],
    distinctive: true,
  },
  {
    id: "oil_paint",
    re: /\boil[- ]paint(?:ed|ing)?(?:\s+(?:animation|frames|on\s+canvas))?\b/i,
    labels: ["painted animation"],
    distinctive: true,
  },
  {
    id: "digital_painting",
    re: /\bdigital painting\b|\bpainted frames\b|\bpaint(?:ed|ing)\s+on\s+(?:glass|celluloid|canvas)\b/i,
    labels: ["painted animation"],
    distinctive: true,
  },
  {
    id: "painted_animation",
    re: /\bpainted animation\b|\boil[- ]painting[- ]style\b/i,
    labels: ["painted animation"],
    distinctive: true,
  },
  {
    id: "stop_motion",
    re: /\bstop[- ]motion\b/i,
    labels: ["stop-motion animation"],
    distinctive: true,
  },
  {
    id: "puppet",
    re: /\bpuppet(?:s|ry)?\s+animation\b|\bpuppetoons?\b/i,
    labels: ["puppet animation"],
    distinctive: true,
  },
  {
    id: "claymation",
    re: /\bclaymation\b|\bclay animation\b|\bplasticine\b/i,
    labels: ["claymation"],
    distinctive: true,
  },
  {
    id: "cut_out",
    re: /\bcut[- ]?outs?\s+animation\b|\bcut[- ]out animation\b|\bpaper cut[- ]outs?\b/i,
    labels: ["cut-out animation"],
    distinctive: true,
  },
  {
    id: "silhouette",
    re: /\bsilhouette animation\b/i,
    labels: ["silhouette animation"],
    distinctive: true,
  },
  {
    id: "hand_drawn",
    re: /\bhand[- ]drawn\b|\btraditionally animated\b|\btraditional (?:cel )?animation\b/i,
    labels: ["hand-drawn animation"],
    distinctive: false,
  },
  {
    id: "2d_computer",
    re: /\b2[dD]\s+computer animation\b/i,
    labels: ["2D computer animation"],
    distinctive: false,
  },
  {
    id: "3d_cgi",
    re: /\b3[dD]\s+(?:computer\s+)?animation\b|\bCGI animation\b|\bcomputer[- ]generated (?:imagery|animation)\b/i,
    labels: ["3D computer animation"],
    distinctive: false,
  },
  {
    id: "animated_documentary",
    re: /\banimated documentary\b|\bdocumentary animation\b/i,
    labels: ["animated documentary"],
    distinctive: true,
  },
  {
    id: "motion_capture",
    re: /\bmotion[- ]capture\b|\bmocap\b|\bperformance capture\b/i,
    labels: ["motion capture"],
    distinctive: true,
    possibleNew: true,
  },
  {
    id: "digital_compositing",
    re: /\bdigital compositing\b/i,
    labels: ["digital compositing"],
    distinctive: true,
    possibleNew: true,
  },
  {
    id: "mixed",
    re: /\bmixed[- ]media animation\b|\bmixed techniques\b/i,
    labels: ["mixed techniques"],
    distinctive: true,
  },
]);

/** Phrases that must never create technique evidence. */
const REJECT_CONTEXT_RE =
  /\b(adult animated|independent animated|indie animated|surreal animation|animated film|animated feature film|genre|album|video game|short story|novel|book)\b/i;

/**
 * @param {string} url
 */
export function classifySourceUrlTier(url) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return SOURCE_TIERS.editorial;
  }

  if (/themoviedb\.org|imdb\.com|wikipedia\.org|wikidata\.org/i.test(host)) {
    return null;
  }

  if (
    /annecy|berlinale|cannes|venice|sundance|bfi\.org|festival/i.test(host) ||
    /presskit|press-kit|mediakit|media-kit/i.test(url) ||
    /official/i.test(host)
  ) {
    return SOURCE_TIERS.official;
  }

  if (
    /cartoonbrew|animationmagazine|awn\.com|variety\.com|hollywoodwire|indiefilm|screendaily|criterion|mubi\.com|indiewire|filmmakermagazine/i.test(
      host
    )
  ) {
    return SOURCE_TIERS.editorial;
  }

  return SOURCE_TIERS.editorial;
}

/**
 * @param {string} text
 * @param {{ sourceUrl?: string | null, sourceLabel: string, tier: string, baseConfidence?: number, requireProductionContext?: boolean }} meta
 */
export function extractTechniqueEvidenceFromText(text, meta) {
  const body = String(text ?? "");
  if (!body.trim()) return [];

  /** @type {object[]} */
  const hits = [];
  for (const pattern of TECHNIQUE_EVIDENCE_PATTERNS) {
    const match = body.match(pattern.re);
    if (!match) continue;
    const start = Math.max(0, (match.index ?? 0) - 80);
    const end = Math.min(body.length, (match.index ?? 0) + match[0].length + 100);
    const snippet = body.slice(start, end).replace(/\s+/g, " ").trim();

    if (REJECT_CONTEXT_RE.test(snippet) && !pattern.re.test(snippet.replace(REJECT_CONTEXT_RE, " "))) {
      // Reject if the only animation cue is adult/independent/etc.
      continue;
    }
    // Reject bare "animated film" style — pattern must be a real method word
    if (/^\s*animated (?:feature )?film\s*$/i.test(match[0])) continue;

    if (meta.requireProductionContext) {
      const window = snippet.toLowerCase();
      const productionCue =
        /\b(produced|production|animated using|made with|shot (?:in|with|using)|created (?:in|with|using)|technique|rotoscop|stop[- ]motion|hand[- ]drawn|puppet|oil[- ]paint|cgi|computer[- ]generated|cut[- ]?out|motion[- ]capture)\b/i.test(
          window
        );
      if (!productionCue) continue;
      // Avoid historical asides about other films when "also" / "unlike" dominate
      if (/\bunlike\b.{0,40}\b(film|movie)\b/i.test(window) && !/\bthis film\b|\bthe film\b|\bit was\b/i.test(window)) {
        continue;
      }
    }

    for (const label of pattern.labels) {
      hits.push({
        label,
        sourceUrl: meta.sourceUrl ?? null,
        sourceLabel: meta.sourceLabel,
        evidenceSummary: snippet.slice(0, 220),
        confidence: meta.baseConfidence ?? TIER_CONFIDENCE[meta.tier] ?? 0.5,
        tier: meta.tier,
        patternId: pattern.id,
        possibleNew: Boolean(pattern.possibleNew),
        distinctive: Boolean(
          pattern.distinctive || isDistinctiveTechniqueLabel(label)
        ),
      });
    }
  }
  return hits;
}

/**
 * @param {string | null | undefined} overview
 */
export function extractTechniqueEvidenceFromTmdbOverview(overview) {
  const text = String(overview ?? "");
  if (!text.trim()) return [];
  return extractTechniqueEvidenceFromText(text, {
    sourceLabel: "TMDB overview (explicit technique mention)",
    sourceUrl: null,
    tier: SOURCE_TIERS.tmdb,
    baseConfidence: TIER_CONFIDENCE.tmdb,
    requireProductionContext: true,
  });
}

/**
 * Curated TMDB keyword → technique label map.
 * Keywords are sparse and noisy: only map distinctive production methods.
 * Do not map bare 2D/3D/CGI/hand-drawn — those reintroduce generic filler.
 */
export const TMDB_KEYWORD_TECHNIQUE_MAP = Object.freeze({
  "stop motion": { label: "stop-motion animation", distinctive: true },
  "stop-motion": { label: "stop-motion animation", distinctive: true },
  "stop-motion animation": { label: "stop-motion animation", distinctive: true },
  claymation: { label: "claymation", distinctive: true },
  "clay animation": { label: "claymation", distinctive: true },
  rotoscoping: { label: "rotoscope", distinctive: true },
  rotoscope: { label: "rotoscope", distinctive: true },
  "puppet animation": { label: "puppet animation", distinctive: true },
  "cut-out animation": { label: "cut-out animation", distinctive: true },
  "cutout animation": { label: "cut-out animation", distinctive: true },
  "silhouette animation": { label: "silhouette animation", distinctive: true },
  "animated documentary": { label: "animated documentary", distinctive: true },
  "mixed media": { label: "mixed techniques", distinctive: true },
  "mixed techniques": { label: "mixed techniques", distinctive: true },
  "painted animation": { label: "painted animation", distinctive: true },
  "oil painting": { label: "painted animation", distinctive: true },
  "oil painted": { label: "painted animation", distinctive: true },
});

/**
 * Map TMDB keyword names to technique evidence rows.
 * @param {Array<{ id?: number, name?: string } | string> | null | undefined} keywords
 */
export function extractTechniqueEvidenceFromTmdbKeywords(keywords) {
  /** @type {object[]} */
  const hits = [];
  const seen = new Set();
  for (const row of keywords ?? []) {
    const name = typeof row === "string" ? row : row?.name;
    if (!name) continue;
    const key = String(name).trim().toLowerCase().replace(/\s+/g, " ");
    const mapped = TMDB_KEYWORD_TECHNIQUE_MAP[key];
    if (!mapped) continue;
    if (seen.has(mapped.label.toLowerCase())) continue;
    seen.add(mapped.label.toLowerCase());
    hits.push({
      label: mapped.label,
      sourceUrl: null,
      sourceLabel: `TMDB keyword: ${name}`,
      evidenceSummary: `TMDB keyword "${name}"`,
      confidence: mapped.distinctive ? 0.62 : 0.5,
      tier: SOURCE_TIERS.tmdb,
      patternId: `tmdb_keyword:${key}`,
      possibleNew: false,
      distinctive: Boolean(
        mapped.distinctive || isDistinctiveTechniqueLabel(mapped.label)
      ),
    });
  }
  return hits;
}

/**
 * @param {number | string} movieId
 * @param {{ tmdbApiKey?: string, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<Array<{ id: number, name: string }>>}
 */
export async function fetchTmdbMovieKeywords(movieId, options = {}) {
  const id = Number(movieId);
  const apiKey = options.tmdbApiKey;
  if (!id || !apiKey) return [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(`https://api.themoviedb.org/3/movie/${id}/keywords`);
  url.searchParams.set("api_key", apiKey);
  try {
    const response = await fetchImpl(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.keywords) ? data.keywords : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} value
 */
export function normalizeTitleForMatch(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strict Wikipedia identity check.
 * @param {{ title: string, original_title?: string | null, year?: number | null, directors?: string[] }} film
 * @param {{ title: string, extract: string, url?: string }} page
 */
export function scoreWikipediaIdentityMatch(film, page) {
  const extract = String(page.extract ?? "");
  const extractNorm = normalizeTitleForMatch(extract.slice(0, 2500));
  const pageTitleNorm = normalizeTitleForMatch(page.title);
  const titleNorm = normalizeTitleForMatch(film.title);
  const originalNorm = normalizeTitleForMatch(film.original_title);
  /** @type {string[]} */
  const reasons = [];

  const titleHit =
    (titleNorm.length >= 4 &&
      (extractNorm.includes(titleNorm) || pageTitleNorm.includes(titleNorm))) ||
    (originalNorm.length >= 4 &&
      (extractNorm.includes(originalNorm) || pageTitleNorm.includes(originalNorm)));

  if (!titleHit) {
    return {
      ok: false,
      ambiguous: true,
      reason: "title_or_original_title_not_confirmed",
    };
  }
  reasons.push("title_confirmed");

  if (film.year) {
    const year = Number(film.year);
    const yearMentions = [...extract.matchAll(/\b(19|20)\d{2}\b/g)].map((m) =>
      Number(m[0])
    );
    const yearOk = yearMentions.some((y) => Math.abs(y - year) <= 1);
    if (!yearOk) {
      return {
        ok: false,
        ambiguous: true,
        reason: "year_not_confirmed",
      };
    }
    reasons.push("year_confirmed");
  } else {
    return { ok: false, ambiguous: true, reason: "year_required" };
  }

  const directors = (film.directors ?? [])
    .map((d) => String(d).trim())
    .filter(Boolean);
  if (directors.length) {
    const directorHit = directors.some((director) => {
      const parts = normalizeTitleForMatch(director).split(" ").filter(Boolean);
      const last = parts[parts.length - 1];
      return (
        last &&
        last.length >= 3 &&
        (extractNorm.includes(last) ||
          normalizeTitleForMatch(extract).includes(normalizeTitleForMatch(director)))
      );
    });
    if (!directorHit) {
      return {
        ok: false,
        ambiguous: true,
        reason: "director_not_confirmed",
      };
    }
    reasons.push("director_confirmed");
  }

  const animatedCue =
    /\banimated (?:feature |feature-length )?(?:film|movie|feature)\b|\banimation (?:film|feature)\b|\bfeature[- ]length animation\b|\banimated feature\b/i.test(
      extract.slice(0, 2000)
    ) || /\((?:19|20)\d{2}[^\)]*\banimated\b/i.test(page.title + " " + extract.slice(0, 400));

  const disallowed =
    /\b(album|video game|novel|short story|television series|TV series|manga series|comic book)\b/i.test(
      page.title
    ) ||
    (/^\s*.+\s+is a (?:novel|album|video game|short story)\b/i.test(extract.slice(0, 220)) &&
      !animatedCue);

  if (disallowed) {
    return {
      ok: false,
      ambiguous: true,
      reason: "not_animated_feature",
    };
  }
  if (!animatedCue) {
    return {
      ok: false,
      ambiguous: true,
      reason: "animated_feature_not_confirmed",
    };
  }
  reasons.push("animated_feature_confirmed");

  return { ok: true, ambiguous: false, reason: reasons.join(",") };
}

/**
 * In-memory Wikipedia run cache + soft-rate tracker.
 * @param {{ budget?: number, delayMs?: number }} [options]
 */
export function createWikipediaResearchState(options = {}) {
  return {
    cache: new Map(),
    requests: 0,
    hits: 0,
    ambiguous: 0,
    errors: 0,
    rateLimited: false,
    stopped: false,
    budget: options.budget ?? DEFAULT_WIKIPEDIA_BUDGET,
    delayMs: options.delayMs ?? DEFAULT_DELAY_MS,
  };
}

/**
 * @param {object | null | undefined} state
 */
export function isWikipediaResearchStopped(state) {
  return Boolean(state?.stopped || state?.rateLimited);
}

/**
 * @param {Response} response
 * @param {number} fallbackMs
 */
function resolveWikipediaBackoffMs(response, fallbackMs) {
  if (fallbackMs === 0) return 0;
  const raw = response?.headers?.get?.("retry-after");
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.max(seconds * 1000, fallbackMs), 180000);
  }
  return Math.max(fallbackMs, DEFAULT_RATE_LIMIT_BACKOFF_MS);
}

/**
 * @param {Record<string, string>} params
 * @param {{ fetchImpl?: typeof fetch, delayMs?: number, state?: object, timeoutMs?: number }} [options]
 */
async function wikipediaApi(params, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const state = options.state;
  if (state?.stopped || state?.rateLimited) {
    const err = new Error("Wikipedia API rate limited (batch stopped)");
    err.code = "wikipedia_rate_limited";
    throw err;
  }
  if (state && state.requests >= state.budget) {
    throw new Error("wikipedia_budget_exhausted");
  }

  const url = new URL(WIKIPEDIA_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const cacheKey = url.toString();
  if (state?.cache?.has(cacheKey)) {
    return state.cache.get(cacheKey);
  }

  const delayMs = options.delayMs ?? state?.delayMs ?? DEFAULT_DELAY_MS;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? WIKIPEDIA_TIMEOUT_MS
  );

  try {
    if (state) state.requests += 1;
    const response = await fetchImpl(cacheKey, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.status === 429 || response.status === 503) {
      if (state) {
        state.errors += 1;
        state.rateLimited = true;
        state.stopped = true;
      }
      await sleep(resolveWikipediaBackoffMs(response, delayMs));
      const err = new Error(`Wikipedia API ${response.status}`);
      err.code = "wikipedia_rate_limited";
      throw err;
    }

    if (!response.ok) {
      if (state) state.errors += 1;
      throw new Error(`Wikipedia API error: ${response.status}`);
    }

    const data = await response.json();
    if (state?.cache) state.cache.set(cacheKey, data);
    await sleep(delayMs);
    return data;
  } catch (error) {
    if (state && error?.code !== "wikipedia_rate_limited") {
      if (!String(error?.message ?? "").includes("Wikipedia API")) {
        state.errors += 1;
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Soft Wikipedia lookup: at most one search hit per query, combined page fetch
 * (extract + url + extlinks). Stops the whole batch state after 429.
 *
 * @param {{ title: string, original_title?: string | null, year?: number | null, directors?: string[] }} film
 * @param {{ fetchImpl?: typeof fetch, delayMs?: number, enabled?: boolean, state?: object }} [options]
 */
export async function fetchWikipediaContentResearch(film, options = {}) {
  if (options.enabled === false) {
    return { page: null, ambiguous: false, reason: "disabled", ambiguousNotes: [] };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const state = options.state ?? createWikipediaResearchState();
  if (isWikipediaResearchStopped(state)) {
    return {
      page: null,
      ambiguous: false,
      reason: "rate_limited",
      ambiguousNotes: [],
    };
  }

  const delayMs = options.delayMs ?? state.delayMs ?? DEFAULT_DELAY_MS;
  const yearSuffix = film.year ? ` ${film.year}` : "";
  // Prefer one strong query; only fall back to a second if needed.
  const queries = [`${film.title}${yearSuffix} animated film`];
  if (film.original_title && film.original_title !== film.title) {
    queries.push(`${film.original_title}${yearSuffix} animated film`);
  } else {
    queries.push(`${film.title}${yearSuffix} film`);
  }

  /** @type {object[]} */
  const ambiguousNotes = [];

  for (const query of queries) {
    if (isWikipediaResearchStopped(state)) {
      return {
        page: null,
        ambiguous: false,
        reason: "rate_limited",
        ambiguousNotes,
      };
    }
    if (state.requests >= state.budget) {
      return {
        page: null,
        ambiguous: false,
        reason: "budget_exhausted",
        ambiguousNotes,
      };
    }
    try {
      const search = await wikipediaApi(
        {
          action: "query",
          list: "search",
          srsearch: query,
          srlimit: "1",
          srnamespace: "0",
        },
        { fetchImpl, delayMs, state }
      );
      const results = search.query?.search ?? [];
      const result = results[0];
      if (!result?.title) continue;

      const pageData = await wikipediaApi(
        {
          action: "query",
          prop: "extracts|info|extlinks",
          explaintext: "1",
          exsectionformat: "plain",
          inprop: "url",
          ellimit: "50",
          titles: result.title,
        },
        { fetchImpl, delayMs, state }
      );
      const pages = Object.values(pageData.query?.pages ?? {});
      const page = pages[0];
      if (!page || page.missing || !page.extract) continue;

      const extlinks = Array.isArray(page.extlinks)
        ? page.extlinks
            .map((row) => row["*"] ?? row.url ?? "")
            .filter(Boolean)
        : [];

      const candidate = {
        title: page.title,
        url: page.fullurl,
        extract: String(page.extract),
        extlinks,
      };
      const match = scoreWikipediaIdentityMatch(film, candidate);
      if (!match.ok) {
        ambiguousNotes.push({
          title: candidate.title,
          url: candidate.url,
          reason: match.reason,
        });
        state.ambiguous += 1;
        continue;
      }
      state.hits += 1;
      return {
        page: candidate,
        ambiguous: false,
        reason: match.reason,
        ambiguousNotes,
      };
    } catch (error) {
      if (error?.code === "wikipedia_rate_limited") {
        return {
          page: null,
          ambiguous: false,
          reason: "rate_limited",
          ambiguousNotes,
        };
      }
      if (String(error?.message) === "wikipedia_budget_exhausted") {
        return {
          page: null,
          ambiguous: false,
          reason: "budget_exhausted",
          ambiguousNotes,
        };
      }
      // Continue other queries on soft errors
      continue;
    }
  }

  return {
    page: null,
    ambiguous: ambiguousNotes.length > 0,
    reason: ambiguousNotes.length ? "ambiguous_wikipedia_match" : "not_found",
    ambiguousNotes,
  };
}

/**
 * @param {string[]} urls
 * @param {{ fetchImpl?: typeof fetch, maxPages?: number, enabled?: boolean }} [options]
 */
export async function fetchSourceUrlTechniqueSnippets(urls, options = {}) {
  if (options.enabled === false) return [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? 3;
  /** @type {object[]} */
  const snippets = [];
  for (const url of (urls ?? []).slice(0, maxPages)) {
    if (!/^https?:\/\//i.test(url)) continue;
    const tier = classifySourceUrlTier(url);
    if (!tier) continue;
    try {
      const text = await fetchOfficialPageText(url, {
        fetchImpl,
        timeoutMs: 10000,
      });
      if (!text || text.length < 80) continue;
      const plain = text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 14000);
      let host = url;
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        // keep url
      }
      snippets.push({ url, host, text: plain, tier });
    } catch {
      // ignore fetch failures
    }
  }
  return snippets;
}

/**
 * Sufficient evidence = at least one official/editorial hit, or any TMDB
 * production-method hit (overview wording or mapped keyword). Wikipedia never
 * counts as sufficient to skip the Wikipedia fallback step.
 *
 * @param {object[]} evidence
 */
export function hasSufficientTechniqueEvidence(evidence) {
  const rows = evidence ?? [];
  if (rows.some((row) => row.tier === SOURCE_TIERS.official)) return true;
  if (rows.some((row) => row.tier === SOURCE_TIERS.editorial)) return true;
  // Distinctive TMDB hits skip Wikipedia. Generic-only TMDB (e.g. bare 2D keyword)
  // still allows Wikipedia fallback in case a stronger method is documented there.
  if (
    rows.some(
      (row) => row.tier === SOURCE_TIERS.tmdb && (row.distinctive || row.possibleNew)
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Gather technique evidence with correct source priority.
 * @param {object} candidate
 * @param {{
 *   tmdbOverview?: string | null,
 *   tmdbMovieId?: number | string | null,
 *   tmdbApiKey?: string | null,
 *   fetchImpl?: typeof fetch,
 *   enableWikipedia?: boolean,
 *   enableSourceFetch?: boolean,
 *   enableWebSearch?: boolean,
 *   enableAiTechnique?: boolean,
 *   aiTechniqueFn?: Function,
 *   openai?: object,
 *   delayMs?: number,
 *   wikipediaState?: object,
 *   webSearchState?: object,
 * }} [options]
 */
export async function gatherTechniqueResearch(candidate, options = {}) {
  /** @type {object[]} */
  const evidence = [];
  /** @type {string[]} */
  const researchSources = [];
  /** @type {string[]} */
  const researchNotes = [];
  /** @type {object[]} */
  const officialSources = [];
  /** @type {object[]} */
  const editorialOrProductionSources = [];
  /** @type {object[]} */
  const tmdbSources = [];
  /** @type {object[]} */
  const wikipediaSources = [];
  /** @type {object[]} */
  const rejectedOrAmbiguousSources = [];
  /** @type {string[]} */
  const webSearchUrls = [];

  let wikipedia = null;
  let usedWikipediaFallback = false;
  let usedWebSearch = false;
  let usedAiTechnique = false;
  let officialFetches = 0;
  const wikipediaState =
    options.wikipediaState ?? createWikipediaResearchState({ delayMs: options.delayMs });
  const webSearchState =
    options.webSearchState ??
    createTechniqueWebSearchState({ delayMs: options.delayMs });

  // 1) source_urls first
  if (options.enableSourceFetch !== false && Array.isArray(candidate.source_urls)) {
    const pages = await fetchSourceUrlTechniqueSnippets(candidate.source_urls, {
      fetchImpl: options.fetchImpl,
      maxPages: 3,
    });
    officialFetches = pages.length;
    for (const page of pages) {
      researchSources.push(page.host);
      const bucket =
        page.tier === SOURCE_TIERS.official
          ? officialSources
          : editorialOrProductionSources;
      bucket.push({ url: page.url, host: page.host, tier: page.tier });
      evidence.push(
        ...extractTechniqueEvidenceFromText(page.text, {
          sourceUrl: page.url,
          sourceLabel: page.host,
          tier: page.tier,
          baseConfidence: TIER_CONFIDENCE[page.tier],
          requireProductionContext: true,
        })
      );
    }
  }

  // 2) TMDB overview + structured keywords
  const fromOverview = extractTechniqueEvidenceFromTmdbOverview(
    options.tmdbOverview
  );
  if (fromOverview.length) {
    researchSources.push("TMDB overview (explicit technique mention)");
    tmdbSources.push({
      label: "TMDB overview",
      tier: SOURCE_TIERS.tmdb,
    });
    evidence.push(...fromOverview);
  }

  if (options.tmdbMovieId && options.tmdbApiKey) {
    const keywordRows = await fetchTmdbMovieKeywords(options.tmdbMovieId, {
      tmdbApiKey: options.tmdbApiKey,
      fetchImpl: options.fetchImpl,
    });
    const fromKeywords = extractTechniqueEvidenceFromTmdbKeywords(keywordRows);
    if (fromKeywords.length) {
      researchSources.push("TMDB keywords");
      tmdbSources.push({
        label: "TMDB keywords",
        tier: SOURCE_TIERS.tmdb,
        keywords: fromKeywords.map((row) => row.label),
      });
      evidence.push(...fromKeywords);
    } else if (keywordRows.length === 0) {
      researchNotes.push("tmdb_keywords_empty_or_unavailable");
    } else {
      researchNotes.push("tmdb_keywords_without_technique_mapping");
    }
  }

  // 3) Web search for allowlisted production / editorial pages when still thin
  const enableWebSearch = options.enableWebSearch === true;
  if (enableWebSearch && !hasSufficientTechniqueEvidence(evidence)) {
    usedWebSearch = true;
    const discovered = await discoverTechniqueUrlsViaWebSearch(candidate, {
      fetchImpl: options.fetchImpl,
      state: webSearchState,
      delayMs: options.delayMs ?? webSearchState.delayMs,
      enabled: true,
      excludeUrls: candidate.source_urls ?? [],
    });
    researchNotes.push(...(discovered.researchNotes ?? []));
    webSearchUrls.push(...(discovered.urls ?? []));

    if (discovered.urls?.length) {
      const pages = await fetchSourceUrlTechniqueSnippets(discovered.urls, {
        fetchImpl: options.fetchImpl,
        maxPages: 3,
      });
      officialFetches += pages.length;
      /** @type {object[]} */
      const webHits = [];
      for (const page of pages) {
        researchSources.push(`web:${page.host}`);
        const bucket =
          page.tier === SOURCE_TIERS.official
            ? officialSources
            : editorialOrProductionSources;
        bucket.push({
          url: page.url,
          host: page.host,
          tier: page.tier,
          via: "web_search",
        });
        const hits = extractTechniqueEvidenceFromText(page.text, {
          sourceUrl: page.url,
          sourceLabel: `web:${page.host}`,
          tier: page.tier,
          baseConfidence: TIER_CONFIDENCE[page.tier],
          requireProductionContext: true,
        });
        webHits.push(...hits);
        evidence.push(...hits);
        if (!hits.length) {
          researchNotes.push(`web_search_page_without_technique:${page.host}`);
        }
      }
      if (webHits.length) {
        researchNotes.push(`web_search_evidence:${webHits.length}`);
      } else if (pages.length) {
        researchNotes.push("web_search_no_technique_wording");
      }
    }
  } else if (!enableWebSearch) {
    researchNotes.push("web_search_disabled");
  } else {
    researchNotes.push("web_search_skipped_sufficient_evidence");
  }

  // 4) Wikipedia fallback only when insufficient evidence
  const enableWikipedia = options.enableWikipedia !== false;
  if (enableWikipedia && !hasSufficientTechniqueEvidence(evidence)) {
    usedWikipediaFallback = true;
    try {
      const wikiResult = await fetchWikipediaContentResearch(
        {
          title: candidate.title,
          original_title: candidate.original_title,
          year: candidate.year,
          directors: candidate.directors,
        },
        {
          fetchImpl: options.fetchImpl,
          delayMs: options.delayMs,
          enabled: true,
          state: wikipediaState,
        }
      );

      if (wikiResult.reason === "ambiguous_wikipedia_match" || wikiResult.ambiguous) {
        researchNotes.push("ambiguous_wikipedia_match");
        for (const note of wikiResult.ambiguousNotes ?? []) {
          rejectedOrAmbiguousSources.push({
            ...note,
            tier: SOURCE_TIERS.wikipedia,
            status: "ambiguous",
          });
        }
      } else if (wikiResult.page) {
        wikipedia = {
          title: wikiResult.page.title,
          url: wikiResult.page.url,
          // Do NOT expose full extract to creative prompts — keep internal only
          matchReason: wikiResult.reason,
        };
        wikipediaSources.push({
          title: wikiResult.page.title,
          url: wikiResult.page.url,
          tier: SOURCE_TIERS.wikipedia,
        });
        researchSources.push(`Wikipedia: ${wikiResult.page.title}`);
        const wikiHits = extractTechniqueEvidenceFromText(wikiResult.page.extract, {
          sourceUrl: wikiResult.page.url,
          sourceLabel: `Wikipedia: ${wikiResult.page.title}`,
          tier: SOURCE_TIERS.wikipedia,
          baseConfidence: TIER_CONFIDENCE.wikipedia,
          requireProductionContext: true,
        });
        evidence.push(...wikiHits);
        if (!wikiHits.length) {
          researchNotes.push("wikipedia_match_without_technique_wording");
        }
      } else if (wikiResult.reason === "rate_limited") {
        researchNotes.push("wikipedia_rate_limited");
      } else if (wikiResult.reason === "budget_exhausted") {
        researchNotes.push("wikipedia_budget_exhausted");
      } else if ((wikiResult.ambiguousNotes ?? []).length) {
        researchNotes.push("ambiguous_wikipedia_match");
        for (const note of wikiResult.ambiguousNotes) {
          rejectedOrAmbiguousSources.push({
            ...note,
            tier: SOURCE_TIERS.wikipedia,
            status: "ambiguous",
          });
        }
      }
    } catch {
      researchNotes.push("wikipedia_error");
      wikipediaState.errors += 1;
    }
  } else if (!enableWikipedia) {
    researchNotes.push("wikipedia_disabled");
  } else {
    researchNotes.push("wikipedia_skipped_sufficient_evidence");
  }

  // 5) AI last resort — only when nothing persistable was found.
  const enableAiTechnique = options.enableAiTechnique === true;
  const persistableBeforeAi = preferEvidenceBackedTechniqueLabels([], evidence);
  if (enableAiTechnique && persistableBeforeAi.length === 0) {
    usedAiTechnique = true;
    let aiResult = await inferTechniqueViaAi(
      candidate,
      {
        tmdbOverview: options.tmdbOverview ?? null,
        researchNotes,
        webSearchUrls,
        wikipediaTitle: wikipedia?.title ?? null,
      },
      {
        enabled: true,
        llmFn: options.aiTechniqueFn,
        openai: options.openai,
      }
    );
    if (!aiResult.evidence?.length) {
      researchNotes.push(...(aiResult.researchNotes ?? []));
      aiResult = await inferTechniqueViaAi(
        candidate,
        {
          tmdbOverview: options.tmdbOverview ?? null,
          researchNotes,
          webSearchUrls,
          wikipediaTitle: wikipedia?.title ?? null,
        },
        {
          enabled: true,
          requireGuess: true,
          llmFn: options.aiTechniqueFn,
          openai: options.openai,
        }
      );
      researchNotes.push("ai_technique_require_guess_retry");
    }
    researchNotes.push(...(aiResult.researchNotes ?? []));
    if (aiResult.evidence?.length) {
      evidence.push(...aiResult.evidence);
      researchSources.push("AI technique inference");
    }
  } else if (!enableAiTechnique) {
    researchNotes.push("ai_technique_disabled");
  } else {
    researchNotes.push("ai_technique_skipped_have_evidence");
  }

  // Dedupe by label+source
  const seen = new Set();
  const deduped = [];
  for (const row of evidence) {
    const key = `${row.label.toLowerCase()}|${row.sourceLabel}|${row.tier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  const strongTiers = new Set([SOURCE_TIERS.official, SOURCE_TIERS.editorial]);
  const hasStrongEvidence = deduped.some((row) => strongTiers.has(row.tier));
  const wikipediaOnlyDistinctive = deduped.filter(
    (row) =>
      row.tier === SOURCE_TIERS.wikipedia &&
      (row.distinctive || row.possibleNew) &&
      !deduped.some(
        (other) =>
          other.label.toLowerCase() === row.label.toLowerCase() &&
          other.tier !== SOURCE_TIERS.wikipedia
      )
  );

  return {
    techniqueEvidence: deduped,
    researchSources,
    researchNotes,
    wikipedia,
    officialSources,
    editorialOrProductionSources,
    tmdbSources,
    wikipediaSources,
    rejectedOrAmbiguousSources,
    descriptionsBasedOnlyOnTmdbOverview:
      officialFetches === 0 &&
      !wikipedia &&
      Boolean(options.tmdbOverview) &&
      editorialOrProductionSources.length === 0,
    hasDirectTechniqueEvidence: deduped.length > 0,
    hasStrongTechniqueEvidence: hasStrongEvidence,
    usedWikipediaFallback,
    usedWebSearch,
    usedAiTechnique,
    webSearchUrls,
    wikipediaOnlyDistinctive,
    officialSourceFetches: officialFetches,
    wikipediaMetrics: {
      requests: wikipediaState.requests,
      hits: wikipediaState.hits,
      ambiguous: wikipediaState.ambiguous,
      errors: wikipediaState.errors,
    },
    webSearchMetrics: {
      requests: webSearchState.requests,
      hits: webSearchState.hits,
      errors: webSearchState.errors,
      rateLimited: webSearchState.rateLimited,
      stopped: webSearchState.stopped,
    },
  };
}
