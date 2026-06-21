import {
  confirmCandidateOnOfficialPage,
  discoverOfficialLinksViaSearch,
  fetchOfficialPageText,
  getFilmTitleVariants,
  isAnnecyProofUrl,
  textMatchesTitleVariant,
} from "./festival-official-verification.mjs";
import {
  buildOfficialArchiveUrls,
  buildOfficialSearchQueries,
  matchFestivalOfficialSource,
} from "./festival-official-sources.mjs";
import { EVIDENCE_STATUSES } from "./festival-evidence-quality.mjs";
import { getTitleSimilarity } from "./film-duplicate-check.mjs";

const MIN_TITLE_SIMILARITY = 88;
const REQUEST_DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Conservative title match for archive discovery — avoids short-title false positives.
 *
 * @param {{ title: string, original_title?: string | null, director?: string | null }} film
 * @param {string} pageText
 */
export function isConservativeArchiveTitleMatch(film, pageText) {
  const titles = getFilmTitleVariants(film);
  const normalizedPage = pageText.toLowerCase();

  for (const title of titles) {
    const normalizedTitle = title.trim().toLowerCase();
    if (normalizedTitle.length < 5) {
      continue;
    }

    if (textMatchesTitleVariant(pageText, title)) {
      if (film.director) {
        const directorParts = film.director
          .split(/[,/&]| and /i)
          .map((part) => part.trim())
          .filter((part) => part.length >= 4);

        if (
          directorParts.length > 0 &&
          !directorParts.some((part) =>
            normalizedPage.includes(part.toLowerCase())
          )
        ) {
          continue;
        }
      }

      return true;
    }

    if (getTitleSimilarity(pageText, title) >= MIN_TITLE_SIMILARITY) {
      return true;
    }
  }

  return false;
}

/**
 * @param {string} pageText
 * @param {number | null | undefined} filmYear
 */
export function inferAnnecyYearFromArchiveUrlOrPage(pageUrl, pageText, filmYear) {
  const urlMatch = pageUrl.match(/\/archives[^/]*\/(\d{4})/i);
  if (urlMatch) {
    return Number.parseInt(urlMatch[1], 10);
  }

  if (filmYear && pageText.includes(String(filmYear))) {
    return filmYear;
  }

  const yearMatches = pageText.match(/\b(19|20)\d{2}\b/g) ?? [];
  if (yearMatches.length === 1) {
    return Number.parseInt(yearMatches[0], 10);
  }

  return filmYear ?? null;
}

/**
 * Attempt to discover Annecy participation by searching official archives for the film title.
 *
 * @param {{ id: string, title: string, original_title?: string | null, director?: string | null, year?: number | null }} film
 * @param {{ fetchImpl?: typeof fetch, delayMs?: number }} [options]
 * @returns {Promise<import("./festival-evidence-quality.mjs").FestivalEvidenceCandidate[]>}
 */
export async function discoverAnnecyCandidatesFromArchiveSearch(film, options = {}) {
  const source = matchFestivalOfficialSource("Annecy");
  if (!source || source.id !== "annecy") {
    return [];
  }

  const archiveYear =
    typeof film.year === "number" && Number.isInteger(film.year)
      ? film.year
      : null;
  const archiveUrls = buildOfficialArchiveUrls(source, archiveYear);
  const searchQueries = buildOfficialSearchQueries(source, film.title, archiveYear);
  const delayMs = options.delayMs ?? REQUEST_DELAY_MS;

  /** @type {import("./festival-evidence-quality.mjs").FestivalEvidenceCandidate[]} */
  const candidates = [];
  /** @type {Set<string>} */
  const seenUrls = new Set();

  /** @type {string[]} */
  const urlsToCheck = [...archiveUrls];

  for (const query of searchQueries) {
    const links = await discoverOfficialLinksViaSearch(query, source, options);
    urlsToCheck.push(...links.filter(isAnnecyProofUrl));
    await sleep(delayMs);
  }

  for (const url of urlsToCheck.slice(0, 12)) {
    if (!isAnnecyProofUrl(url) || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);

    const pageText = await fetchOfficialPageText(url, options);
    await sleep(delayMs);

    if (!pageText || !isConservativeArchiveTitleMatch(film, pageText)) {
      continue;
    }

    const stubCandidate = {
      festival_name: "Annecy International Animation Film Festival",
      festival_year: inferAnnecyYearFromArchiveUrlOrPage(url, pageText, archiveYear),
      section: null,
      recognition_type: "official_selection",
      award_name: null,
      award_level: null,
      source_url: url,
      source_type: "archive_title_search",
      original_text: null,
    };

    const confirmation = confirmCandidateOnOfficialPage(pageText, film, stubCandidate);
    if (!confirmation) {
      continue;
    }

    candidates.push({
      festival_name: "Annecy International Animation Film Festival",
      festival_year: inferAnnecyYearFromArchiveUrlOrPage(url, pageText, archiveYear),
      section: confirmation.section ?? null,
      recognition_type: confirmation.recognition_type,
      award_name: confirmation.award_name ?? null,
      award_level: confirmation.award_level ?? null,
      source_url: url,
      source_label: "annecyfestival.com",
      source_type: "archive_title_search",
      original_text: confirmation.original_text ?? null,
      evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW,
      acceptance_reason:
        "Located on annecyfestival.com archive via title search; pending dedicated verification pass.",
      importable: false,
      film_title: film.title,
      needs_manual_review: true,
    });
  }

  return candidates;
}
