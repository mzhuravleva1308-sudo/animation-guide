import { getTitleSimilarity, normalizeFilmString } from "./film-duplicate-check.mjs";
import {
  EVIDENCE_STATUSES,
  hasExplicitAwardEvidence,
  hasExplicitPremiereEvidence,
  hasExplicitSelectionEvidence,
  resolveEvidenceStatus,
} from "./festival-evidence-quality.mjs";
import {
  buildOfficialArchiveUrls,
  buildOfficialSearchQueries,
  isOfficialSourceUrl,
  matchFestivalOfficialSource,
  resolveOfficialHref,
} from "./festival-official-sources.mjs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15000;
const REQUEST_DELAY_MS = 2500;
const RATE_LIMIT_RETRY_DELAYS_MS = [5000, 15000, 45000];
const MIN_HTML_BODY_LENGTH = 1200;
const RATE_LIMIT_PAGE_PATTERN = /429\s+too many requests|too many requests in a given amount of time/i;
const MISSING_ARCHIVE_PAGE_PATTERN =
  /n['’]existe plus|does not exist|changed place|page introuvable|page not found/i;

/**
 * @typedef {import("./festival-evidence-quality.mjs").FestivalEvidenceCandidate} FestivalEvidenceCandidate
 *
 * @typedef {{
 *   film_title: string,
 *   official_url: string | null,
 *   festival_name: string,
 *   festival_year: number | null,
 *   section: string | null,
 *   recognition_type: string,
 *   evidence_status: string,
 *   imported: boolean,
 *   acceptance_reason: string,
 * }} OfficialVerificationLogRow
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ANNECY_PROOF_HOST = "annecyfestival.com";

/**
 * @param {string | null | undefined} url
 */
export function isAnnecyProofUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    return host === ANNECY_PROOF_HOST || host.endsWith(`.${ANNECY_PROOF_HOST}`);
  } catch {
    return false;
  }
}

export class FestivalRateLimitError extends Error {
  /**
   * @param {string} url
   */
  constructor(url) {
    super(`Rate limited by festival site: ${url}`);
    this.name = "FestivalRateLimitError";
    this.url = url;
  }
}

/**
 * @param {Response} response
 * @param {string} text
 */
export function isRateLimitedFestivalResponse(response, text) {
  if (response.status === 429) {
    return true;
  }

  return RATE_LIMIT_PAGE_PATTERN.test(text);
}

/**
 * @param {string | null | undefined} pageText
 */
export function isMissingArchivePage(pageText) {
  return MISSING_ARCHIVE_PAGE_PATTERN.test(String(pageText ?? ""));
}

/**
 * @param {string | null | undefined} value
 */
export function normalizeTextForMatch(value) {
  return normalizeFilmString(String(value ?? ""), { stripArticles: true });
}

/**
 * @param {string | null | undefined} value
 */
export function compactTextForMatch(value) {
  return normalizeTextForMatch(value).replace(/\s+/g, "");
}

/**
 * @param {{ title: string, original_title?: string | null }} film
 */
export function getFilmTitleVariants(film) {
  return [...new Set([film.title, film.original_title].filter(Boolean))];
}

/**
 * @param {string} haystack
 * @param {string} needle
 */
export function textMatchesTitleVariant(haystack, needle) {
  const normalizedHaystack = normalizeTextForMatch(haystack);
  const normalizedNeedle = normalizeTextForMatch(needle);
  if (!normalizedNeedle) {
    return false;
  }

  if (normalizedHaystack.includes(normalizedNeedle)) {
    return true;
  }

  const compactHaystack = compactTextForMatch(haystack);
  const compactNeedle = compactTextForMatch(needle);
  if (compactNeedle.length >= 4 && compactHaystack.includes(compactNeedle)) {
    return true;
  }

  return getTitleSimilarity(haystack, needle) >= 88;
}

/**
 * @param {string} pageText
 * @param {{ title: string, original_title?: string | null, year?: number | null }} film
 * @param {{ festivalYear?: number | null }} [options]
 */
export function pageContainsFilm(pageText, film, options = {}) {
  const titles = getFilmTitleVariants(film);
  const titleMatched = titles.some((title) => textMatchesTitleVariant(pageText, title));

  if (!titleMatched) {
    return false;
  }

  const yearToMatch = options.festivalYear ?? film.year ?? null;
  if (yearToMatch == null) {
    return true;
  }

  return pageText.includes(String(yearToMatch));
}

/**
 * @param {string} pageText
 * @param {number | null | undefined} festivalYear
 */
export function pageContainsFestivalYear(pageText, festivalYear) {
  if (festivalYear == null) {
    return true;
  }

  return pageText.includes(String(festivalYear));
}

/**
 * @param {string} pageText
 * @param {FestivalEvidenceCandidate} candidate
 */
export function refineRecognitionFromOfficialPage(pageText, candidate) {
  const text = pageText.toLowerCase();
  const original = candidate.original_text?.toLowerCase() ?? "";

  if (
    /\b(grand prix|won|winner|crystal|jury prize|award(ed)?|prize winner|best feature)\b/i.test(
      text
    ) ||
    /\b(grand prix|won|winner|crystal|jury prize|award(ed)?|prize winner|best feature)\b/i.test(
      original
    )
  ) {
    const awardMatch = pageText.match(
      /\b((?:grand prix|crystal(?: for [^,.;<>]+)?|jury prize|special jury prize|award for best feature)[^,.;<>]*)/i
    );

    return {
      recognition_type: /\b(winner|won|grand prix|crystal|best feature)\b/i.test(
        text
      )
        ? "winner"
        : "award",
      section: candidate.section ?? null,
      award_name: awardMatch?.[1]?.trim() ?? candidate.award_name ?? null,
      award_level: /\b(grand prix|crystal|best feature)\b/i.test(text)
        ? "grand_prize"
        : /\bjury prize\b/i.test(text)
          ? "jury_prize"
          : candidate.award_level ?? null,
    };
  }

  if (/\b(nominee|nominated|nomination)\b/i.test(text)) {
    return {
      recognition_type: "nominee",
      section: candidate.section ?? null,
      award_name: candidate.award_name ?? null,
      award_level: candidate.award_level ?? null,
    };
  }

  const sectionMatchers = [
    {
      pattern: /directors' fortnight|quinzaine des cin[eé]astes|quinzaine-realisateurs/i,
      section: "Directors' Fortnight",
      recognition_type: "official_selection",
    },
    {
      pattern: /un certain regard/i,
      section: "Un Certain Regard",
      recognition_type: "official_selection",
    },
    {
      pattern:
        /official competition|in competition|competition programme|main competition|golden bear|\bcompetition\b/i,
      section: "Competition",
      recognition_type: "official_selection",
    },
    {
      pattern: /contre(?:-|\s)?champ|feature films in competition|official selection/i,
      section: candidate.section ?? "Official Selection",
      recognition_type: "official_selection",
    },
  ];

  for (const matcher of sectionMatchers) {
    if (matcher.pattern.test(text) || matcher.pattern.test(original)) {
      return {
        recognition_type: matcher.recognition_type,
        section: matcher.section,
        award_name: candidate.award_name ?? null,
        award_level: candidate.award_level ?? null,
      };
    }
  }

  if (
    hasExplicitPremiereEvidence(text) ||
    hasExplicitPremiereEvidence(original)
  ) {
    return {
      recognition_type: "screening",
      section: candidate.section ?? null,
      award_name: null,
      award_level: null,
    };
  }

  if (
    hasExplicitSelectionEvidence(text) ||
    hasExplicitSelectionEvidence(original)
  ) {
    return {
      recognition_type: "official_selection",
      section: candidate.section ?? "Official Selection",
      award_name: null,
      award_level: null,
    };
  }

  if (
    hasExplicitAwardEvidence(text) ||
    hasExplicitAwardEvidence(original)
  ) {
    return {
      recognition_type: candidate.recognition_type,
      section: candidate.section ?? null,
      award_name: candidate.award_name ?? null,
      award_level: candidate.award_level ?? null,
    };
  }

  return null;
}

/**
 * @param {string} pageText
 * @param {{ title: string, original_title?: string | null, year?: number | null }} film
 * @param {FestivalEvidenceCandidate} candidate
 */
export function confirmCandidateOnOfficialPage(pageText, film, candidate) {
  if (
    !pageContainsFilm(pageText, film, {
      festivalYear: candidate.festival_year ?? film.year ?? null,
    })
  ) {
    return null;
  }

  if (
    !pageContainsFestivalYear(
      pageText,
      candidate.festival_year ?? film.year ?? null
    )
  ) {
    return null;
  }

  const refined = refineRecognitionFromOfficialPage(pageText, candidate);
  if (!refined) {
    return null;
  }

  const snippet = extractSupportingSnippet(pageText, film, refined);
  if (!snippet) {
    return null;
  }

  return {
    ...refined,
    original_text: snippet,
  };
}

/**
 * @param {string} pageText
 * @param {{ title: string, original_title?: string | null }} film
 * @param {{ recognition_type: string, section?: string | null, award_name?: string | null }} refined
 */
function extractSupportingSnippet(pageText, film, refined) {
  const titles = getFilmTitleVariants(film);
  const lines = pageText
    .split(/\n|<\/(?:p|li|td|div|h\d)>/i)
    .map((line) => line.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const titleHit = titles.some((title) => textMatchesTitleVariant(line, title));
    if (!titleHit) {
      continue;
    }

    if (
      refined.recognition_type === "official_selection" &&
      (hasExplicitSelectionEvidence(line) ||
        /directors' fortnight|competition|selection|quinzaine/i.test(line))
    ) {
      return line.slice(0, 400);
    }

    if (
      ["winner", "award", "nominee", "special_mention"].includes(
        refined.recognition_type
      ) &&
      (hasExplicitAwardEvidence(line) ||
        hasExplicitAwardEvidence(pageText.slice(0, 5000)))
    ) {
      return line.slice(0, 400);
    }

    if (
      refined.recognition_type === "screening" &&
      hasExplicitPremiereEvidence(line)
    ) {
      return line.slice(0, 400);
    }

    return line.slice(0, 400);
  }

  return null;
}

/**
 * @param {string} html
 * @param {{ title: string, original_title?: string | null }} film
 * @param {import("./festival-official-sources.mjs").FestivalOfficialSource} source
 * @param {string} pageUrl
 */
export function extractProgrammeLinksFromIndexHtml(html, film, source, pageUrl) {
  const titles = getFilmTitleVariants(film);
  /** @type {string[]} */
  const links = [];

  for (const title of titles) {
    const compactTitle = compactTextForMatch(title);
    if (compactTitle.length < 4) {
      continue;
    }

    const pattern = new RegExp(
      compactTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );

    let searchFrom = 0;
    while (searchFrom < html.length && links.length < 8) {
      const compactSlice = compactTextForMatch(html.slice(searchFrom, searchFrom + 4000));
      const matchIndex = compactSlice.search(pattern);
      if (matchIndex === -1) {
        break;
      }

      const absoluteIndex = searchFrom + matchIndex;
      const windowStart = Math.max(0, absoluteIndex - 1500);
      const windowEnd = Math.min(html.length, absoluteIndex + 1500);
      const windowHtml = html.slice(windowStart, windowEnd);
      const hrefMatches = windowHtml.matchAll(/href="([^"]+)"/gi);

      for (const hrefMatch of hrefMatches) {
        const resolved = resolveOfficialHref(hrefMatch[1], pageUrl);
        if (!resolved || !isOfficialSourceUrl(resolved, source)) {
          continue;
        }
        if (!links.includes(resolved)) {
          links.push(resolved);
        }
      }

      searchFrom = absoluteIndex + compactTitle.length;
    }
  }

  return links;
}

/**
 * @param {string} html
 * @param {import("./festival-official-sources.mjs").FestivalOfficialSource} source
 */
export function extractOfficialLinksFromSearchHtml(html, source) {
  const links = html.match(/https?:\/\/[^"'<>\s]+/g) ?? [];
  return [
    ...new Set(
      links
        .map((url) => url.replace(/&amp;/g, "&"))
        .filter((url) => isOfficialSourceUrl(url, source))
    ),
  ];
}

/**
 * @param {string[]} urls
 * @param {import("./festival-official-sources.mjs").FestivalOfficialSource} source
 */
export function filterOfficialSeedUrls(urls, source) {
  return [...new Set(urls.filter((url) => url && isOfficialSourceUrl(url, source)))];
}

/**
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function fetchOfficialPageText(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = 1 + RATE_LIMIT_RETRY_DELAYS_MS.length;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? FETCH_TIMEOUT_MS
    );

    try {
      const response = await fetchImpl(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();

      if (isRateLimitedFestivalResponse(response, text)) {
        const retryDelay = RATE_LIMIT_RETRY_DELAYS_MS[attempt];
        if (retryDelay != null) {
          await sleep(retryDelay);
          continue;
        }
        throw new FestivalRateLimitError(url);
      }

      if (!/html|text/i.test(contentType)) {
        return null;
      }

      if (text.length < MIN_HTML_BODY_LENGTH && !response.ok) {
        return null;
      }

      if (!response.ok && text.length < MIN_HTML_BODY_LENGTH) {
        return null;
      }

      if (isMissingArchivePage(text)) {
        return null;
      }

      return text;
    } catch (error) {
      if (error instanceof FestivalRateLimitError) {
        throw error;
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new FestivalRateLimitError(url);
}

/**
 * @param {string} query
 * @param {import("./festival-official-sources.mjs").FestivalOfficialSource} source
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function discoverOfficialLinksViaSearch(query, source, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchOfficialPageText(url, {
    fetchImpl,
    timeoutMs: 12000,
  });

  if (!html) {
    return [];
  }

  return extractOfficialLinksFromSearchHtml(html, source).slice(0, 5);
}

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null }} film
 * @param {FestivalEvidenceCandidate} candidate
 * @param {string} url
 * @param {import("./festival-official-sources.mjs").FestivalOfficialSource} source
 * @param {{ fetchImpl?: typeof fetch, delayMs?: number }} [options]
 */
async function tryConfirmOfficialUrl(film, candidate, url, source, options = {}) {
  if (!isOfficialSourceUrl(url, source)) {
    return null;
  }

  if (source.id === "annecy" && !isAnnecyProofUrl(url)) {
    return null;
  }

  let pageText;
  try {
    pageText = await fetchOfficialPageText(url, options);
  } catch (error) {
    if (error instanceof FestivalRateLimitError) {
      throw error;
    }
    return null;
  }

  await sleep(options.delayMs ?? REQUEST_DELAY_MS);

  if (!pageText) {
    return null;
  }

  const confirmation = confirmCandidateOnOfficialPage(pageText, film, candidate);
  if (!confirmation) {
    return null;
  }

  const verifiedCandidate = {
    ...candidate,
    ...confirmation,
    source_url: url,
    source_label: new URL(url).hostname.replace(/^www\./i, ""),
    source_type: "official_archive",
    ...resolveEvidenceStatus(
      {
        ...candidate,
        ...confirmation,
        source_url: url,
      },
      { sourceTier: "official", explicitText: confirmation.original_text }
    ),
    acceptance_reason:
      "Confirmed on an official festival archive or programme page with matching film title, year, and participation wording.",
  };

  return {
    candidate: verifiedCandidate,
    log: buildVerificationLog(verifiedCandidate, {
      official_url: url,
      imported: verifiedCandidate.importable,
      acceptance_reason: verifiedCandidate.acceptance_reason,
    }),
  };
}

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null }} film
 * @param {FestivalEvidenceCandidate} candidate
 * @param {{ fetchImpl?: typeof fetch, delayMs?: number, seedUrls?: string[] }} [options]
 */
export async function verifyAnnecyCandidate(film, candidate, options = {}) {
  const source = matchFestivalOfficialSource(candidate.festival_name);
  if (!source || source.id !== "annecy") {
    return {
      candidate,
      log: buildVerificationLog(candidate, {
        official_url: null,
        imported: false,
        acceptance_reason:
          "Candidate is not an Annecy festival recognition.",
      }),
    };
  }

  return verifyCandidateOfficially(film, candidate, options);
}

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null }} film
 * @param {FestivalEvidenceCandidate} candidate
 * @param {{ fetchImpl?: typeof fetch, delayMs?: number, seedUrls?: string[] }} [options]
 */
export async function verifyCandidateOfficially(film, candidate, options = {}) {
  const source = matchFestivalOfficialSource(candidate.festival_name);
  if (!source) {
    return {
      candidate,
      log: buildVerificationLog(candidate, {
        official_url: null,
        imported: false,
        acceptance_reason:
          "No configured official source mapping for this festival name.",
      }),
    };
  }

  const archiveYear =
    typeof candidate.festival_year === "number" &&
    Number.isInteger(candidate.festival_year)
      ? candidate.festival_year
      : typeof film.year === "number" && Number.isInteger(film.year)
        ? film.year
        : null;
  const archiveUrls = buildOfficialArchiveUrls(source, archiveYear).filter(
    (url) => source.id !== "annecy" || isAnnecyProofUrl(url)
  );
  const searchQueries = buildOfficialSearchQueries(
    source,
    film.title,
    archiveYear
  );
  const seedUrls = filterOfficialSeedUrls(options.seedUrls ?? [], source).filter(
    (url) => source.id !== "annecy" || isAnnecyProofUrl(url)
  );

  /** @type {string[]} */
  const programmeLinks = [];
  try {
    for (const indexUrl of archiveUrls) {
      let indexHtml;
      try {
        indexHtml = await fetchOfficialPageText(indexUrl, options);
      } catch (error) {
        if (error instanceof FestivalRateLimitError) {
          return {
            candidate,
            log: buildVerificationLog(candidate, {
              official_url: null,
              imported: false,
              acceptance_reason:
                "Annecy rate limit (429). Claim left unverified; retry verification later.",
            }),
            rateLimited: true,
          };
        }
        indexHtml = null;
      }
      await sleep(options.delayMs ?? REQUEST_DELAY_MS);
    if (!indexHtml) {
      continue;
    }

    const direct = await tryConfirmOfficialUrl(
      film,
      candidate,
      indexUrl,
      source,
      options
    );
    if (direct) {
      return direct;
    }

    programmeLinks.push(
      ...extractProgrammeLinksFromIndexHtml(
        indexHtml,
        film,
        source,
        indexUrl
      )
    );
    }
  } catch (error) {
    if (error instanceof FestivalRateLimitError) {
      return {
        candidate,
        log: buildVerificationLog(candidate, {
          official_url: null,
          imported: false,
          acceptance_reason:
            "Annecy rate limit (429). Claim left unverified; retry verification later.",
        }),
        rateLimited: true,
      };
    }
    throw error;
  }

  /** @type {string[]} */
  const discovered = [...seedUrls];
  for (const query of searchQueries) {
    const links = await discoverOfficialLinksViaSearch(query, source, options);
    discovered.push(...links);
    await sleep(options.delayMs ?? REQUEST_DELAY_MS);
  }

  const urls = [
    ...new Set([...archiveUrls, ...programmeLinks, ...discovered]),
  ].slice(0, 20);

  for (const url of urls) {
    if (archiveUrls.includes(url)) {
      continue;
    }

    try {
      const result = await tryConfirmOfficialUrl(
        film,
        candidate,
        url,
        source,
        options
      );
      if (result) {
        return result;
      }
    } catch (error) {
      if (error instanceof FestivalRateLimitError) {
        return {
          candidate,
          log: buildVerificationLog(candidate, {
            official_url: null,
            imported: false,
            acceptance_reason:
              "Annecy rate limit (429). Claim left unverified; retry verification later.",
          }),
          rateLimited: true,
        };
      }
      throw error;
    }
  }

  return {
    candidate,
    log: buildVerificationLog(candidate, {
      official_url: null,
      imported: false,
      acceptance_reason:
        "No official archive page with sufficient film title, year, and participation confirmation was found.",
    }),
  };
}

/**
 * @param {FestivalEvidenceCandidate} candidate
 * @param {{ official_url: string | null, imported: boolean, acceptance_reason: string }} details
 */
function buildVerificationLog(candidate, details) {
  return {
    film_title: candidate.film_title ?? "",
    official_url: details.official_url,
    festival_name: candidate.festival_name,
    festival_year: candidate.festival_year ?? null,
    section: candidate.section ?? null,
    recognition_type: candidate.recognition_type,
    evidence_status: candidate.evidence_status,
    imported: details.imported,
    acceptance_reason: details.acceptance_reason,
  };
}

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null }} film
 * @param {FestivalEvidenceCandidate[]} candidates
 * @param {{ fetchImpl?: typeof fetch, delayMs?: number, seedUrls?: string[] }} [options]
 */
export async function verifyCandidatesOfficially(film, candidates, options = {}) {
  /** @type {FestivalEvidenceCandidate[]} */
  const updated = [];
  /** @type {OfficialVerificationLogRow[]} */
  const verificationLog = [];

  for (const candidate of candidates) {
    if (candidate.evidence_status !== EVIDENCE_STATUSES.NEEDS_REVIEW) {
      updated.push(candidate);
      continue;
    }

    const result = await verifyCandidateOfficially(film, candidate, options);
    updated.push(result.candidate);
    verificationLog.push(result.log);
  }

  return { candidates: updated, verificationLog };
}
