/**
 * Guardrails against invented discovery candidates / fake source URLs.
 * Heuristics are deterministic; TMDB identity match is optional and stronger.
 */

import { DISCOVERY_REJECT_REASON } from "./film-discovery.mjs";
import { findTmdbMatchForCandidate } from "./film-discovery-media.mjs";
import { normalizeSourceUrls } from "./film-discovery-eligibility.mjs";

/** Hosts we trust enough to verify a film exists (still may need TMDB). */
const TRUSTED_SOURCE_HOST_RE =
  /(?:^|\.)(imdb\.com|themoviedb\.org|wikipedia\.org|wikidata\.org|annecy\.org|cartoonbrew\.com|awn\.com|animationmagazine\.net|bfi\.org\.uk|mubi\.com)$/i;

/**
 * Ascending/repeating digit patterns common in LLM-invented IMDb ids.
 * @param {string} digits
 */
export function looksLikePlaceholderDigitRun(digits) {
  const raw = String(digits ?? "");
  if (!/^\d{5,}$/.test(raw)) return false;
  if (/^(\d)\1+$/.test(raw)) return true; // 1111111
  if (/^0*1234567$/.test(raw) || /^0*12345678$/.test(raw)) return true;
  if (/^2345678$/.test(raw) || /^3456789$/.test(raw) || /^0123456$/.test(raw)) {
    return true;
  }
  // Strict ascending by 1 for full run (1234567, 2345678, …)
  let ascending = true;
  for (let i = 1; i < raw.length; i += 1) {
    if (Number(raw[i]) !== (Number(raw[i - 1]) + 1) % 10) {
      ascending = false;
      break;
    }
  }
  if (ascending && raw.length >= 6) return true;
  return false;
}

/**
 * @param {string} url
 * @returns {{ ok: boolean, host: string | null, issues: string[] }}
 */
export function assessSourceUrlCredibility(url) {
  /** @type {string[]} */
  const issues = [];
  let host = null;
  let pathname = "";

  try {
    const parsed = new URL(String(url ?? "").trim());
    host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    pathname = parsed.pathname;
  } catch {
    return { ok: false, host: null, issues: ["invalid_url"] };
  }

  const imdbMatch = pathname.match(/\/title\/(tt\d{5,})\b/i);
  if (imdbMatch) {
    const id = imdbMatch[1];
    const digits = id.slice(2);
    if (looksLikePlaceholderDigitRun(digits)) {
      issues.push(`placeholder_imdb_id:${id}`);
    }
  }

  // Country+filmfestival.com style domains invented by models (unless well-known).
  if (
    /filmfestival\.com$/i.test(host) &&
    !/^(annecy|ottawa|zagreb|animafest)/i.test(host)
  ) {
    issues.push(`suspicious_festival_host:${host}`);
  }

  if (/example\.com$|placeholder|localhost/i.test(host)) {
    issues.push(`placeholder_host:${host}`);
  }

  return { ok: issues.length === 0, host, issues };
}

/**
 * @param {{ source_urls?: string[] }} candidate
 */
export function assessCandidateSourceCredibility(candidate) {
  const urls = normalizeSourceUrls(candidate.source_urls);
  if (urls.length === 0) {
    return {
      ok: false,
      reason_code: DISCOVERY_REJECT_REASON.insufficientSources,
      issues: ["no_source_urls"],
      trusted_url_count: 0,
      url_reports: [],
    };
  }

  const url_reports = urls.map((url) => ({
    url,
    ...assessSourceUrlCredibility(url),
  }));
  const issues = url_reports.flatMap((row) => row.issues);
  const trusted_url_count = url_reports.filter(
    (row) =>
      row.ok &&
      row.host &&
      TRUSTED_SOURCE_HOST_RE.test(row.host)
  ).length;

  const allUntrustedOrFake =
    trusted_url_count === 0 || url_reports.every((row) => !row.ok);

  if (issues.some((issue) => issue.startsWith("placeholder_imdb_id"))) {
    return {
      ok: false,
      reason_code: DISCOVERY_REJECT_REASON.insufficientSources,
      issues,
      trusted_url_count,
      url_reports,
    };
  }

  if (allUntrustedOrFake) {
    return {
      ok: false,
      reason_code: DISCOVERY_REJECT_REASON.insufficientSources,
      issues: [...issues, "no_trusted_verifiable_source"],
      trusted_url_count,
      url_reports,
    };
  }

  return {
    ok: true,
    reason_code: null,
    issues,
    trusted_url_count,
    url_reports,
  };
}

/**
 * Confirm the title/year exists on TMDB as an accepted identity match.
 *
 * @param {object} candidate
 * @param {{ tmdbApiKey: string, fetchImpl?: typeof fetch, findMatch?: typeof findTmdbMatchForCandidate }} options
 */
export async function verifyCandidateExistsOnTmdb(candidate, options) {
  const findMatch = options.findMatch ?? findTmdbMatchForCandidate;
  if (!options.tmdbApiKey) {
    return {
      ok: false,
      skipped: true,
      reason: "TMDB_API_KEY missing",
      match: null,
      evaluation: null,
    };
  }

  const result = await findMatch(
    {
      title: candidate.title,
      original_title: candidate.original_title,
      year: candidate.year,
      directors: candidate.directors,
      countries: candidate.countries,
    },
    {
      tmdbApiKey: options.tmdbApiKey,
      fetchImpl: options.fetchImpl,
    }
  );

  if (!result.match || !result.evaluation?.accepted) {
    return {
      ok: false,
      skipped: false,
      reason: "no_tmdb_identity_match",
      match: null,
      evaluation: result.evaluation,
      candidatesTried: result.candidatesTried,
    };
  }

  return {
    ok: true,
    skipped: false,
    reason: null,
    match: {
      id: result.match.id,
      title: result.match.title,
      original_title: result.match.original_title,
      release_date: result.match.release_date,
    },
    evaluation: result.evaluation,
    candidatesTried: result.candidatesTried,
  };
}
