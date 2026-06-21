import { normalizeOptionalText } from "./film-festival-recognition.mjs";

export const EVIDENCE_STATUSES = {
  CONFIRMED_OFFICIAL: "confirmed_official_source",
  CONFIRMED_SECONDARY: "confirmed_reliable_secondary_source",
  NEEDS_REVIEW: "candidate_needs_review",
  SKIPPED: "skipped_insufficient_evidence",
  SKIPPED_OUT_OF_SCOPE: "skipped_out_of_scope_festival",
};

export const STRONG_RECOGNITION_TYPES = new Set([
  "winner",
  "award",
  "nominee",
  "official_selection",
]);

const OFFICIAL_HOST_PATTERNS = [
  /(?:^|\.)annecyfestival\.com$/i,
  /(?:^|\.)annecy\.org$/i,
  /(?:^|\.)festival-cannes\.com$/i,
  /(?:^|\.)quinzaine-realisateurs\.com$/i,
  /(?:^|\.)berlinale\.de$/i,
  /(?:^|\.)labiennale\.org$/i,
  /(?:^|\.)lavenezia\.org$/i,
  /(?:^|\.)sundance\.org$/i,
  /(?:^|\.)festival\.sundance\.org$/i,
  /(?:^|\.)animationfestival\.ca$/i,
  /(?:^|\.)hiroshima-anim\.jp$/i,
  /(?:^|\.)animafest\.hr$/i,
  /(?:^|\.)itfs\.de$/i,
  /(?:^|\.)whatson\.bfi\.org\.uk$/i,
  /(?:^|\.)bfi\.org\.uk$/i,
  /(?:^|\.)fantoche\.ch$/i,
  /(?:^|\.)locarnofestival\.ch$/i,
  /(?:^|\.)iffrotterdam\.nl$/i,
  /(?:^|\.)tiff\.net$/i,
  /(?:^|\.)sansebastianfestival\.com$/i,
  /(?:^|\.)edfilmfest\.org$/i,
];

const RELIABLE_SECONDARY_HOST_PATTERNS = [
  /(?:^|\.)screendaily\.com$/i,
  /(?:^|\.)variety\.com$/i,
  /(?:^|\.)hollywoodreporter\.com$/i,
  /(?:^|\.)deadline\.com$/i,
  /(?:^|\.)indiewire\.com$/i,
  /(?:^|\.)cartoonbrew\.com$/i,
  /(?:^|\.)imdb\.com$/i,
];

const EXPLICIT_SELECTION_PATTERN =
  /\b(official selection|selected for|in competition|competition programme|competitive section|official competition|contre(?:-|\s)?courant|un certain regard|out of competition|special screening|programme)\b/i;

const EXPLICIT_PREMIERE_PATTERN =
  /\b(world premiere|festival premiere|premiered at|premiere at|opened the|screened at|screening at|made its premiere)\b/i;

const EXPLICIT_AWARD_PATTERN =
  /\b(winner|won|award(ed)?|prize|grand prix|palme d'or|golden bear|silver bear|crystal|nominee|nominated|nomination|special mention|honorable mention|jury mention)\b/i;

/**
 * @typedef {import("../types/film-festival-recognition").FilmFestivalRecognitionInput} FilmFestivalRecognitionInput
 *
 * @typedef {FilmFestivalRecognitionInput & {
 *   evidence_status: string,
 *   acceptance_reason: string,
 *   importable: boolean,
 *   film_title?: string,
 * }} FestivalEvidenceCandidate
 */

/**
 * @param {string | null | undefined} url
 */
export function classifySourceUrl(url) {
  const trimmed = normalizeOptionalText(url);
  if (!trimmed) {
    return { tier: "unknown", label: null, host: null };
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./i, "");

    if (/wikipedia\.org$/i.test(host)) {
      return { tier: "wikipedia", label: "Wikipedia", host };
    }

    if (OFFICIAL_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
      return { tier: "official", label: host, host };
    }

    if (RELIABLE_SECONDARY_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
      return { tier: "reliable_secondary", label: host, host };
    }

    if (
      /(?:^|\/)(?:press|newsroom|media-kit|presskit|press-kit)(?:\/|[-_.]|$)/i.test(
        parsed.pathname
      )
    ) {
      return { tier: "official", label: host, host };
    }

    return { tier: "other", label: host, host };
  } catch {
    return { tier: "unknown", label: trimmed, host: null };
  }
}

/**
 * @param {string} recognitionType
 */
export function requiresOfficialCorroboration(recognitionType) {
  return STRONG_RECOGNITION_TYPES.has(recognitionType);
}

/**
 * @param {string} text
 */
export function hasExplicitSelectionEvidence(text) {
  return EXPLICIT_SELECTION_PATTERN.test(text);
}

/**
 * @param {string} text
 */
export function hasExplicitPremiereEvidence(text) {
  return EXPLICIT_PREMIERE_PATTERN.test(text);
}

/**
 * @param {string} text
 */
export function hasExplicitAwardEvidence(text) {
  return EXPLICIT_AWARD_PATTERN.test(text);
}

/**
 * @param {FestivalEvidenceCandidate} candidate
 */
export function shouldImportCandidate(candidate) {
  if (!candidate.importable) {
    return false;
  }

  if (
    candidate.evidence_status === EVIDENCE_STATUSES.SKIPPED ||
    candidate.evidence_status === EVIDENCE_STATUSES.NEEDS_REVIEW
  ) {
    return false;
  }

  return candidate.evidence_status === EVIDENCE_STATUSES.CONFIRMED_OFFICIAL;
}

/**
 * @param {string} text
 */
export function inferRecognitionTypeFromExplicitText(text) {
  const normalized = text.toLowerCase();

  if (
    /\b(winner|won|grand prix|palme d'or|golden bear|crystal)\b/.test(normalized)
  ) {
    return "winner";
  }

  if (/\b(award(ed)?|prize)\b/.test(normalized)) {
    return "award";
  }

  if (/\b(nominee|nominated|nomination)\b/.test(normalized)) {
    return "nominee";
  }

  if (/\b(special mention|honorable mention|jury mention)\b/.test(normalized)) {
    return "special_mention";
  }

  if (hasExplicitSelectionEvidence(normalized)) {
    return "official_selection";
  }

  if (hasExplicitPremiereEvidence(normalized)) {
    return "screening";
  }

  return null;
}

/**
 * @param {string | null | undefined} extract
 */
export function extractUrlsFromText(extract) {
  if (!extract) {
    return [];
  }

  const matches = extract.match(/https?:\/\/[^\s)\]"']+/g) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[.,;]+$/, "")))];
}

/**
 * @param {FestivalEvidenceCandidate} candidate
 * @param {string[]} urls
 */
export function findOfficialCorroborationUrl(candidate, urls) {
  const festivalNeedle = candidate.festival_name.toLowerCase();

  for (const url of urls) {
    const classification = classifySourceUrl(url);
    if (classification.tier !== "official") {
      continue;
    }

    if (
      classification.host &&
      OFFICIAL_HOST_PATTERNS.some((pattern) => pattern.test(classification.host))
    ) {
      return url;
    }
  }

  return null;
}

/**
 * @param {Partial<FestivalEvidenceCandidate>} candidate
 * @param {{ sourceTier?: string, explicitText?: string, wikipediaOnly?: boolean }} context
 */
export function resolveEvidenceStatus(candidate, context = {}) {
  const sourceUrl = normalizeOptionalText(candidate.source_url);
  const sourceTier =
    context.sourceTier ?? classifySourceUrl(sourceUrl).tier ?? "unknown";

  if (sourceTier === "official") {
    return {
      evidence_status: EVIDENCE_STATUSES.CONFIRMED_OFFICIAL,
      acceptance_reason:
        "Supported by an official festival, film, distributor, or press-kit source URL.",
      importable: true,
    };
  }

  if (context.wikipediaOnly) {
    return {
      evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW,
      acceptance_reason:
        "Wikipedia supplied the only located evidence; awaiting official festival archive, film site, distributor page, or press kit.",
      importable: false,
    };
  }

  if (
    sourceTier === "catalog_field" &&
    context.explicitText &&
    (hasExplicitAwardEvidence(context.explicitText) ||
      hasExplicitSelectionEvidence(context.explicitText) ||
      (candidate.recognition_type === "screening" &&
        hasExplicitPremiereEvidence(context.explicitText)))
  ) {
    return {
      evidence_status: EVIDENCE_STATUSES.CONFIRMED_SECONDARY,
      acceptance_reason:
        "Legacy catalog metadata contains explicit award, selection/programme, or premiere wording.",
      importable: true,
    };
  }

  if (
    sourceTier === "reliable_secondary" &&
    context.explicitText &&
    !requiresOfficialCorroboration(candidate.recognition_type ?? "")
  ) {
    return {
      evidence_status: EVIDENCE_STATUSES.CONFIRMED_SECONDARY,
      acceptance_reason:
        "Supported by reliable secondary coverage with explicit festival wording.",
      importable: true,
    };
  }

  return {
    evidence_status: EVIDENCE_STATUSES.SKIPPED,
    acceptance_reason:
      "Insufficient explicit evidence or source quality for automatic import.",
    importable: false,
  };
}
