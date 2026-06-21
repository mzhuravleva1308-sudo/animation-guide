import { rebuildImportableFromCandidates } from "./backfill-film-festival-recognitions.mjs";
import {
  EVIDENCE_STATUSES,
  resolveEvidenceStatus,
} from "./festival-evidence-quality.mjs";
import { buildOfficialArchiveUrls, matchFestivalOfficialSource } from "./festival-official-sources.mjs";
import {
  FestivalRateLimitError,
  fetchOfficialPageText,
  getFilmTitleVariants,
  isAnnecyProofUrl,
  pageContainsFilm,
  textMatchesTitleVariant,
} from "./festival-official-verification.mjs";

const REQUEST_DELAY_MS = 3000;
const PRESENCE_ARCHIVE_SUFFIXES = [
  "award-winners",
  `${"{year}"}-programme:pse`,
  "feature-films-in-competition",
  "short-films-in-competition",
  "programme",
];

/**
 * @typedef {import("./festival-evidence-quality.mjs").FestivalEvidenceCandidate} FestivalEvidenceCandidate
 *
 * @typedef {{
 *   found: boolean,
 *   festivalYear: number | null,
 *   officialUrl: string | null,
 *   rateLimited: boolean,
 *   reason: string,
 *   recognitions: FestivalEvidenceCandidate[],
 * }} FilmFestivalPresenceResult
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} value
 */
function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&agrave;/gi, "à")
    .replace(/&uuml;/gi, "ü")
    .replace(/&ouml;/gi, "ö")
    .replace(/&aacute;/gi, "á")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {{ year?: number | null }} film
 * @param {{ festival_year?: number | null } | null | undefined} [claim]
 */
export function buildFestivalYearHints(film, claim) {
  /** @type {number[]} */
  const hints = [];

  const push = (value) => {
    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 1900 &&
      value <= 2100 &&
      !hints.includes(value)
    ) {
      hints.push(value);
    }
  };

  push(claim?.festival_year ?? null);
  push(film.year ?? null);

  for (const base of [...hints]) {
    push(base - 1);
    push(base + 1);
  }

  return hints;
}

/**
 * @param {string} festivalId
 * @param {number} year
 */
export function buildAnnecyPresenceArchiveUrls(festivalId, year) {
  if (festivalId !== "annecy") {
    return buildOfficialArchiveUrls(matchFestivalOfficialSource("Annecy"), year).filter(
      (url) => isAnnecyProofUrl(url)
    );
  }

  return [
    `https://www.annecy.org/about/archives/${year}/programme-${year}:pse`,
    ...PRESENCE_ARCHIVE_SUFFIXES.map((suffix) => {
      const path = suffix.replace("{year}", String(year));
      return `https://www.annecyfestival.com/about/archives:en/${year}:en/${path}`;
    }),
  ];
}

/**
 * @param {string} html
 * @param {{ title: string, original_title?: string | null }} film
 * @param {number} festivalYear
 * @param {string} pageUrl
 * @param {string} festivalName
 */
export function extractAnnecyRecognitionsFromHtml(
  html,
  film,
  festivalYear,
  pageUrl,
  festivalName = "Annecy International Animated Film Festival"
) {
  const titles = getFilmTitleVariants(film);
  /** @type {FestivalEvidenceCandidate[]} */
  const recognitions = [];
  /** @type {Set<string>} */
  const seen = new Set();

  const segments = html.split(/<h2\b/i);
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    const headingMatch = segment.match(/^[^>]*>([^<]+)<\/h2>([\s\S]*)/i);
    if (!headingMatch) {
      continue;
    }

    const heading = decodeHtmlEntities(headingMatch[1]);
    const block = headingMatch[2];
    const isAwardHeading =
      /award|cristal|crystal|prix|prize|mention|trophy|palm/i.test(heading);

    for (const titleMatch of block.matchAll(/<h4[^>]*>([^<]+)<\/h4>/gi)) {
      const onPageTitle = decodeHtmlEntities(titleMatch[1]);
      if (!titles.some((title) => textMatchesTitleVariant(onPageTitle, title))) {
        continue;
      }

      const recognitionType = isAwardHeading ? "award" : "official_selection";
      const dedupeFragment = `${recognitionType}|${heading}|${festivalYear}`;
      if (seen.has(dedupeFragment)) {
        continue;
      }
      seen.add(dedupeFragment);

      const candidate = {
        festival_name: festivalName,
        festival_year: festivalYear,
        section: isAwardHeading ? null : heading,
        recognition_type: recognitionType,
        award_name: isAwardHeading ? heading : null,
        award_level: /\b(cristal|crystal|grand prix|feature film)\b/i.test(heading)
          ? "grand_prize"
          : null,
        source_url: pageUrl,
        source_label: "annecyfestival.com",
        source_type: "official_archive",
        original_text: `${onPageTitle} — ${heading} (Annecy ${festivalYear})`,
        evidence_status: EVIDENCE_STATUSES.CONFIRMED_OFFICIAL,
        acceptance_reason:
          "Extracted from official Annecy archive page after film title match.",
        importable: true,
        film_title: film.title,
      };

      recognitions.push({
        ...candidate,
        ...resolveEvidenceStatus(candidate, {
          sourceTier: "official",
          explicitText: candidate.original_text,
        }),
      });
    }
  }

  if (recognitions.length === 0 && pageContainsFilm(html, film, { festivalYear })) {
    const fallback = {
      festival_name: festivalName,
      festival_year: festivalYear,
      section: null,
      recognition_type: "official_selection",
      award_name: null,
      award_level: null,
      source_url: pageUrl,
      source_label: "annecyfestival.com",
      source_type: "official_archive",
      original_text: `${film.title} listed on official Annecy archive (${festivalYear}).`,
      evidence_status: EVIDENCE_STATUSES.CONFIRMED_OFFICIAL,
      acceptance_reason:
        "Film title matched on official Annecy archive page; award details not parsed.",
      importable: true,
      film_title: film.title,
    };

    recognitions.push({
      ...fallback,
      ...resolveEvidenceStatus(fallback, {
        sourceTier: "official",
        explicitText: fallback.original_text,
      }),
    });
  }

  return recognitions;
}

/**
 * @param {FestivalEvidenceCandidate[]} recognitions
 */
export function dedupeExtractedRecognitions(recognitions) {
  /** @type {Map<string, FestivalEvidenceCandidate>} */
  const byKey = new Map();

  for (const recognition of recognitions) {
    const key = [
      recognition.festival_year ?? "",
      recognition.recognition_type,
      recognition.award_name ?? "",
      recognition.section ?? "",
    ].join("|");

    if (!byKey.has(key)) {
      byKey.set(key, recognition);
    }
  }

  return [...byKey.values()];
}

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null }} film
 * @param {string} festivalId
 * @param {{ festival_year?: number | null } | null} [claim]
 * @param {{ fetchImpl?: typeof fetch, delayMs?: number, presenceOnly?: boolean }} [options]
 * @returns {Promise<FilmFestivalPresenceResult>}
 */
export async function verifyFilmFestivalPresence(
  film,
  festivalId,
  claim = null,
  options = {}
) {
  const source = matchFestivalOfficialSource(
    festivalId === "annecy" ? "Annecy" : festivalId
  );

  if (!source || source.id !== festivalId) {
    return {
      found: false,
      festivalYear: null,
      officialUrl: null,
      rateLimited: false,
      reason: `No configured official source for festival "${festivalId}".`,
      recognitions: [],
    };
  }

  const yearHints = buildFestivalYearHints(film, claim);
  /** @type {FestivalEvidenceCandidate[]} */
  const allRecognitions = [];
  let firstProofUrl = null;
  let confirmedYear = null;
  let rateLimitHits = 0;
  let fetchAttempts = 0;

  for (const year of yearHints) {
    const urls = buildAnnecyPresenceArchiveUrls(festivalId, year);

    for (const url of urls) {
      let html;
      fetchAttempts += 1;
      try {
        html = await fetchOfficialPageText(url, options);
      } catch (error) {
        if (error instanceof FestivalRateLimitError) {
          rateLimitHits += 1;
          continue;
        }
        html = null;
      }

      await sleep(options.delayMs ?? REQUEST_DELAY_MS);

      if (!html || !pageContainsFilm(html, film, { festivalYear: year })) {
        continue;
      }

      if (!firstProofUrl) {
        firstProofUrl = url;
        confirmedYear = year;
      }

      if (options.presenceOnly) {
        break;
      }

      allRecognitions.push(
        ...extractAnnecyRecognitionsFromHtml(
          html,
          film,
          year,
          url,
          "Annecy International Animated Film Festival"
        )
      );
    }

    if (firstProofUrl) {
      break;
    }
  }

  if (options.presenceOnly && firstProofUrl) {
    return {
      found: true,
      festivalYear: confirmedYear,
      officialUrl: firstProofUrl,
      rateLimited: false,
      reason: "Official Annecy presence confirmed on festival archive.",
      recognitions: [],
    };
  }

  const recognitions = dedupeExtractedRecognitions(allRecognitions);

  if (!firstProofUrl) {
    if (rateLimitHits > 0) {
      return {
        found: false,
        festivalYear: null,
        officialUrl: null,
        rateLimited: true,
        reason:
          "Annecy rate limit (429). Presence check paused; retry verification later.",
        recognitions: [],
      };
    }

    return {
      found: false,
      festivalYear: null,
      officialUrl: null,
      rateLimited: false,
      reason:
        "No official Annecy archive page listed this film for the tried festival years.",
      recognitions: [],
    };
  }

  return {
    found: true,
    festivalYear: confirmedYear,
    officialUrl: firstProofUrl,
    rateLimited: false,
    reason:
      recognitions.length > 1
        ? `Official Annecy presence confirmed; extracted ${recognitions.length} recognition(s).`
        : recognitions.length === 1 && recognitions[0].award_name
          ? `Official Annecy presence confirmed (${recognitions[0].award_name}).`
          : "Official Annecy presence confirmed on festival archive.",
    recognitions,
  };
}

/**
 * @param {FestivalEvidenceCandidate[]} recognitions
 */
export function buildImportableRecognitions(recognitions) {
  const { importable } = rebuildImportableFromCandidates(recognitions);
  return importable;
}
