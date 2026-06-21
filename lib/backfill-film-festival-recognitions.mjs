import {
  getFestivalRecognitionSignalWeight,
  normalizeFestivalName,
  normalizeOptionalText,
  parseFilmFestivalRecognitionInput,
} from "./film-festival-recognition.mjs";
import { extractSourceLabel } from "./catalog-analytics.mjs";
import {
  EVIDENCE_STATUSES,
  extractUrlsFromText,
  findOfficialCorroborationUrl,
  classifySourceUrl,
  hasExplicitAwardEvidence,
  hasExplicitPremiereEvidence,
  hasExplicitSelectionEvidence,
  inferRecognitionTypeFromExplicitText,
  requiresOfficialCorroboration,
  resolveEvidenceStatus,
  shouldImportCandidate,
} from "./festival-evidence-quality.mjs";
import {
  isConfiguredFestival,
  matchFestivalOfficialSource,
} from "./festival-official-sources.mjs";

export const CATALOG_BACKFILL_IMPORT_SOURCE = "catalog_backfill_v1";

export {
  EVIDENCE_STATUSES,
  shouldImportCandidate,
} from "./festival-evidence-quality.mjs";

const STRONG_FESTIVAL_KEYS = [
  "annecy",
  "cannes",
  "berlinale",
  "berlin international",
  "venice",
  "sundance",
  "ottawa",
  "animafest",
  "hiroshima",
  "locarno",
  "rotterdam",
  "toronto",
  "san sebastian",
  "fantoche",
];

const NON_FESTIVAL_NAME_PATTERNS = [
  /\bacademy awards?\b/i,
  /\boscars?\b/i,
  /\bannie awards?\b/i,
  /\bemmy awards?\b/i,
  /\bgolden globes?\b/i,
  /\bbafta awards?\b/i,
  /\bgrammy awards?\b/i,
  /\bceasar awards?\b/i,
  /\bcezars?\b/i,
];

const RECOGNITION_PRIORITY = {
  winner: 100,
  award: 90,
  nominee: 75,
  special_mention: 65,
  official_selection: 50,
  screening: 5,
};

/**
 * @typedef {import("./festival-evidence-quality.mjs").FestivalEvidenceCandidate} FestivalEvidenceCandidate
 * @typedef {import("../types/film-festival-recognition").FilmFestivalRecognitionInput} FilmFestivalRecognitionInput
 */

export function isLikelyFilmFestivalName(festivalName) {
  const normalized = normalizeOptionalText(festivalName);
  if (!normalized) {
    return false;
  }

  if (NON_FESTIVAL_NAME_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  if (/\bfestival\b/i.test(normalized) || isStrongFestivalName(normalized)) {
    return true;
  }

  return false;
}

/**
 * @param {string | null | undefined} festivalName
 */
export function isStrongFestivalName(festivalName) {
  const normalized = normalizeFestivalName(festivalName ?? "");
  if (!normalized) {
    return false;
  }

  return STRONG_FESTIVAL_KEYS.some((key) => normalized.includes(key));
}

/**
 * @param {FestivalEvidenceCandidate | FilmFestivalRecognitionInput} recognition
 */
export function scoreBackfillRecognition(recognition) {
  const base = RECOGNITION_PRIORITY[recognition.recognition_type] ?? 0;
  const signal = getFestivalRecognitionSignalWeight(recognition);
  const strongBonus = isStrongFestivalName(recognition.festival_name) ? 8 : 0;
  return base + signal * 10 + strongBonus;
}

/**
 * @param {FestivalEvidenceCandidate[]} candidates
 * @param {number} [max=5]
 */
export function rankAndLimitImportableCandidates(candidates, max = 5) {
  const importable = candidates.filter((candidate) => shouldImportCandidate(candidate));
  const deduped = dedupeCandidates(importable);
  const filtered = dropRedundantScreenings(deduped);
  return filtered
    .slice()
    .sort(
      (left, right) =>
        scoreBackfillRecognition(right) - scoreBackfillRecognition(left)
    )
    .slice(0, max);
}

/**
 * @param {FestivalEvidenceCandidate[]} candidates
 */
export function dropRedundantScreenings(candidates) {
  const strongerKeys = new Set(
    candidates
      .filter((candidate) => candidate.recognition_type !== "screening")
      .map((candidate) =>
        [
          canonicalFestivalKey(candidate.festival_name),
          candidate.festival_year ?? "unknown-year",
        ].join("|")
      )
  );

  return candidates.filter((candidate) => {
    if (candidate.recognition_type !== "screening") {
      return true;
    }

    const key = [
      canonicalFestivalKey(candidate.festival_name),
      candidate.festival_year ?? "unknown-year",
    ].join("|");

    return !strongerKeys.has(key);
  });
}

/**
 * @param {FestivalEvidenceCandidate[]} candidates
 */
export function dedupeCandidates(candidates) {
  /** @type {Map<string, FestivalEvidenceCandidate>} */
  const byKey = new Map();

  for (const candidate of candidates) {
    const key = buildBackfillImportKey(candidate);
    const existing = byKey.get(key);
    if (
      !existing ||
      scoreBackfillRecognition(candidate) > scoreBackfillRecognition(existing)
    ) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()];
}

/**
 * @param {string | null | undefined} festivalName
 */
export function canonicalFestivalKey(festivalName) {
  const normalized = normalizeFestivalName(festivalName ?? "");
  if (!normalized) {
    return "";
  }

  for (const key of STRONG_FESTIVAL_KEYS) {
    if (normalized.includes(key)) {
      return key;
    }
  }

  return normalized;
}

/**
 * @param {{ festival_name: string, festival_year?: number | null, recognition_type: string, award_name?: string | null, section?: string | null }} recognition
 */
export function buildBackfillImportKey(recognition) {
  return [
    canonicalFestivalKey(recognition.festival_name),
    recognition.festival_year ?? "unknown-year",
    recognition.recognition_type,
    recognition.award_name ? normalizeFestivalName(recognition.award_name) : "",
    recognition.section ?? "",
  ].join("|");
}

/**
 * @param {FestivalEvidenceCandidate} candidate
 * @returns {FilmFestivalRecognitionInput | null}
 */
export function finalizeBackfillRecognition(candidate) {
  const parsed = parseFilmFestivalRecognitionInput({
    festival_name: candidate.festival_name,
    festival_year: candidate.festival_year,
    section: candidate.section,
    recognition_type: candidate.recognition_type,
    award_name: candidate.award_name,
    award_level: candidate.award_level,
    source_url: candidate.source_url,
    source_label: candidate.source_label,
    source_type: candidate.source_type,
    original_text: candidate.original_text,
    import_source: CATALOG_BACKFILL_IMPORT_SOURCE,
    import_key: buildBackfillImportKey(candidate),
  });

  if (!parsed.ok) {
    return null;
  }

  return parsed.value;
}

/**
 * @param {{ id: string, title: string, year?: number | null, festival?: string | null, section?: string | null, source_url?: string | null }} film
 * @returns {FestivalEvidenceCandidate[]}
 */
export function extractLegacyCatalogCandidates(film) {
  const festival = normalizeOptionalText(film.festival);
  const section = normalizeOptionalText(film.section);
  const catalogSourceUrl = normalizeOptionalText(film.source_url);

  if (!festival) {
    return [];
  }

  const originalText = [festival, section].filter(Boolean).join(" — ");
  const recognitionType = inferRecognitionTypeFromExplicitText(originalText);

  if (!recognitionType) {
    return [
      {
        festival_name: festival,
        festival_year: film.year ?? null,
        section,
        recognition_type: "screening",
        award_name: null,
        award_level: null,
        source_url: catalogSourceUrl,
        source_label: catalogSourceUrl
          ? extractSourceLabel(catalogSourceUrl)
          : "Catalog festival field",
        source_type: "catalog_field",
        original_text: originalText,
        evidence_status: EVIDENCE_STATUSES.SKIPPED,
        acceptance_reason:
          "Legacy festival field names a festival but lacks explicit award, selection/programme, or premiere wording.",
        importable: false,
        film_title: film.title,
      },
    ];
  }

  const evidence = resolveEvidenceStatus(
    {
      recognition_type: recognitionType,
      source_url: catalogSourceUrl,
    },
    {
      sourceTier: catalogSourceUrl
        ? classifySourceUrl(catalogSourceUrl).tier
        : "catalog_field",
      explicitText: originalText,
    }
  );

  return [
    {
      festival_name: festival,
      festival_year: film.year ?? null,
      section,
      recognition_type: recognitionType,
      award_name: inferLegacyAwardName(originalText),
      award_level: inferLegacyAwardLevel(originalText, recognitionType),
      source_url: catalogSourceUrl,
      source_label: catalogSourceUrl
        ? extractSourceLabel(catalogSourceUrl)
        : "Catalog festival field",
      source_type: catalogSourceUrl
        ? classifySourceUrl(catalogSourceUrl).tier === "official"
          ? "official_archive"
          : "catalog_field"
        : "catalog_field",
      original_text: originalText,
      film_title: film.title,
      ...evidence,
    },
  ];
}

/**
 * @param {string} text
 */
function inferLegacyAwardName(text) {
  const match = text.match(
    /\b((?:grand prix|palme d'or|golden bear|silver bear|crystal(?: for [^,.;]+)?|jury prize|special mention|honorable mention)[^,.;]*)/i
  );
  return match ? match[1].trim() : null;
}

/**
 * @param {string} text
 * @param {string} recognitionType
 */
function inferLegacyAwardLevel(text, recognitionType) {
  if (!["winner", "award", "nominee", "special_mention"].includes(recognitionType)) {
    return null;
  }

  const normalized = text.toLowerCase();

  if (/\b(grand prix|palme d'or|golden bear|crystal)\b/.test(normalized)) {
    return "grand_prize";
  }

  if (/\bjury prize\b/.test(normalized)) {
    return "jury_prize";
  }

  if (/\b(special mention|honorable mention)\b/.test(normalized)) {
    return "mention";
  }

  return recognitionType === "nominee" ? null : "category_award";
}

/**
 * @param {unknown} payload
 * @returns {FestivalEvidenceCandidate[]}
 */
export function parseWikipediaExtractionCandidates(payload) {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.recognitions)
      ? payload.recognitions
      : [];

  /** @type {FestivalEvidenceCandidate[]} */
  const candidates = [];

  for (const item of items) {
    if (item?.confidence && item.confidence !== "confirmed") {
      continue;
    }

    const festivalName = item?.festival_name ?? item?.festivalName;
    if (!isLikelyFilmFestivalName(festivalName)) {
      continue;
    }

    const recognitionType =
      item?.recognition_type ??
      item?.recognitionType ??
      inferRecognitionTypeFromExplicitText(String(item?.original_text ?? item?.originalText ?? ""));

    if (!recognitionType) {
      continue;
    }

    candidates.push({
      festival_name: festivalName,
      festival_year: item?.festival_year ?? item?.festivalYear ?? null,
      section: normalizeOptionalText(item?.section ?? item?.programme ?? item?.program),
      recognition_type: recognitionType,
      award_name: normalizeOptionalText(item?.award_name ?? item?.awardName),
      award_level: item?.award_level ?? item?.awardLevel ?? null,
      source_url: normalizeOptionalText(item?.source_url ?? item?.sourceUrl),
      source_label: normalizeOptionalText(item?.source_label ?? item?.sourceLabel),
      source_type: "wikipedia",
      original_text: normalizeOptionalText(item?.original_text ?? item?.originalText),
      evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW,
      acceptance_reason:
        "Extracted from Wikipedia text pending official corroboration.",
      importable: false,
    });
  }

  return candidates;
}

/**
 * @param {FestivalEvidenceCandidate[]} candidates
 * @param {{ title: string, url: string, extract: string }} wikipedia
 */
export function evaluateWikipediaCandidates(candidates, wikipedia) {
  const urls = [
    ...extractUrlsFromText(wikipedia.extract),
    wikipedia.url,
  ];

  return candidates.map((candidate) => {
    const officialUrl = findOfficialCorroborationUrl(candidate, urls);
    if (officialUrl) {
      const classification = classifySourceUrl(officialUrl);
      const evidence = resolveEvidenceStatus(
        { ...candidate, source_url: officialUrl, recognition_type: candidate.recognition_type },
        { sourceTier: "official", explicitText: candidate.original_text ?? "" }
      );

      return {
        ...candidate,
        source_url: officialUrl,
        source_label: classification.label,
        source_type: "official_archive",
        ...evidence,
      };
    }

    const evidence = resolveEvidenceStatus(candidate, {
      wikipediaOnly: true,
      explicitText: candidate.original_text ?? "",
    });

    return {
      ...candidate,
      source_url: wikipedia.url,
      source_label: "Wikipedia",
      source_type: "wikipedia",
      ...evidence,
    };
  });
}

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null, director?: string | null, festival?: string | null, section?: string | null }} film
 * @param {{ title: string, url: string, extract: string }} wikipedia
 */
export function buildOpenAiFestivalExtractionPrompt(film, wikipedia) {
  return `
Extract candidate festival recognitions for this animated film from the source text below.

Film metadata:
- Title: ${film.title}
- Original title: ${film.original_title ?? "unknown"}
- Year: ${film.year ?? "unknown"}
- Director: ${film.director ?? "unknown"}
- Existing catalog festival field: ${film.festival ?? "none"}
- Existing catalog section field: ${film.section ?? "none"}

Source (${wikipedia.title}):
URL: ${wikipedia.url}

Text:
${wikipedia.extract.slice(0, 12000)}

Return ONLY valid JSON with this shape:
{
  "recognitions": [
    {
      "festivalName": string,
      "festivalYear": number | null,
      "section": string | null,
      "recognitionType": "winner" | "award" | "nominee" | "official_selection" | "special_mention" | "screening",
      "awardName": string | null,
      "awardLevel": "grand_prize" | "jury_prize" | "category_award" | "mention" | null,
      "originalText": string,
      "confidence": "confirmed"
    }
  ]
}

Rules:
- Include ONLY film festivals and animation festivals.
- Exclude award ceremonies such as Academy Awards, Oscars, Annie Awards, Golden Globes, BAFTA awards, Emmy Awards, César Awards.
- Include ONLY facts explicitly stated in the source text.
- Do not infer nominations, wins, or selections from vague wording.
- official_selection requires explicit selection/competition/programme language.
- screening requires explicit premiere/screening language.
- Prefer the 3-5 most significant events: wins/prizes, nominations, official selections at major festivals.
- originalText must quote or closely paraphrase the exact supporting phrase from the source.
- Return {"recognitions": []} when nothing is confirmed.
`.trim();
}

const OUT_OF_SCOPE_ACCEPTANCE_REASON =
  "Festival is outside the configured backfill scope (10 official festival sources).";

const FESTIVAL_FILTER_SKIP_REASON =
  "Candidate festival does not match the active --festival filter.";

/**
 * @param {string | null | undefined} festivalName
 * @returns {string | null}
 */
export function getFestivalOfficialSourceId(festivalName) {
  return matchFestivalOfficialSource(festivalName)?.id ?? null;
}

/**
 * @param {{ festival_name: string }} candidate
 * @param {string} festivalId
 */
export function isCandidateForFestival(candidate, festivalId) {
  return getFestivalOfficialSourceId(candidate.festival_name) === festivalId;
}

/**
 * Returns true when the film has at least one candidate for the target festival
 * (legacy catalog field, legacy candidates, or raw Wikipedia extraction).
 *
 * @param {string} festivalId
 * @param {{
 *   film?: { festival?: string | null },
 *   legacyCandidates?: FestivalEvidenceCandidate[],
 *   wikipediaCandidates?: FestivalEvidenceCandidate[],
 * }} sources
 */
export function isFilmInFestivalScope(festivalId, sources = {}) {
  const { film, legacyCandidates = [], wikipediaCandidates = [] } = sources;

  if (
    film?.festival &&
    isCandidateForFestival({ festival_name: film.festival }, festivalId)
  ) {
    return true;
  }

  if (legacyCandidates.some((candidate) => isCandidateForFestival(candidate, festivalId))) {
    return true;
  }

  if (
    wikipediaCandidates.some((candidate) => isCandidateForFestival(candidate, festivalId))
  ) {
    return true;
  }

  return false;
}

/**
 * @param {FestivalEvidenceCandidate} candidate
 * @returns {FestivalEvidenceCandidate}
 */
export function markFestivalFilterSkippedCandidate(candidate) {
  return {
    ...candidate,
    evidence_status: EVIDENCE_STATUSES.SKIPPED,
    acceptance_reason: FESTIVAL_FILTER_SKIP_REASON,
    importable: false,
  };
}

/**
 * @param {FestivalEvidenceCandidate[]} candidates
 * @param {string} festivalId
 */
export function filterCandidatesByFestivalId(candidates, festivalId) {
  /** @type {FestivalEvidenceCandidate[]} */
  const matched = [];
  /** @type {FestivalEvidenceCandidate[]} */
  const filteredOut = [];

  for (const candidate of candidates) {
    if (isCandidateForFestival(candidate, festivalId)) {
      matched.push(candidate);
    } else if (isConfiguredFestival(candidate.festival_name)) {
      filteredOut.push(
        markFestivalFilterSkippedCandidate({
          ...candidate,
          film_title: candidate.film_title,
        })
      );
    } else {
      filteredOut.push(markOutOfScopeFestivalCandidate(candidate));
    }
  }

  return { matched, filteredOut };
}

/**
 * @param {FestivalEvidenceCandidate} candidate
 * @returns {FestivalEvidenceCandidate}
 */
export function markOutOfScopeFestivalCandidate(candidate) {
  return {
    ...candidate,
    evidence_status: EVIDENCE_STATUSES.SKIPPED_OUT_OF_SCOPE,
    acceptance_reason: OUT_OF_SCOPE_ACCEPTANCE_REASON,
    importable: false,
  };
}

/**
 * @param {FestivalEvidenceCandidate[]} candidates
 */
export function partitionCandidatesByFestivalScope(candidates) {
  /** @type {FestivalEvidenceCandidate[]} */
  const inScope = [];
  /** @type {FestivalEvidenceCandidate[]} */
  const outOfScope = [];

  for (const candidate of candidates) {
    if (isConfiguredFestival(candidate.festival_name)) {
      inScope.push(candidate);
    } else {
      outOfScope.push(markOutOfScopeFestivalCandidate(candidate));
    }
  }

  return { inScope, outOfScope };
}

/**
 * @param {FestivalEvidenceCandidate[]} candidates
 */
export function rebuildImportableFromCandidates(candidates, max = 5) {
  const importableCandidates = rankAndLimitImportableCandidates(candidates, max);
  const importable = importableCandidates
    .map((candidate) => finalizeBackfillRecognition(candidate))
    .filter(Boolean);

  return { importableCandidates, importable };
}

/**
 * @param {{ title: string, year?: number | null, festival?: string | null, section?: string | null, source_url?: string | null }} film
 * @param {{ title: string, url: string, extract: string } | null} wikipedia
 * @param {FestivalEvidenceCandidate[]} wikipediaCandidates
 * @param {{ festivalFilterId?: string | null }} [options]
 */
export function buildFilmFestivalEvidence(
  film,
  wikipedia,
  wikipediaCandidates = [],
  options = {}
) {
  const { festivalFilterId = null } = options;
  const legacyCandidates = extractLegacyCatalogCandidates(film);
  const inScopeWikipediaCandidates = wikipediaCandidates.filter((candidate) =>
    isConfiguredFestival(candidate.festival_name)
  );
  const evaluatedWikipedia = wikipedia
    ? evaluateWikipediaCandidates(inScopeWikipediaCandidates, wikipedia)
    : [];

  const scopedLegacy = partitionCandidatesByFestivalScope(legacyCandidates);
  const outOfScopeSkipped = [
    ...scopedLegacy.outOfScope,
    ...wikipediaCandidates
      .filter((candidate) => !isConfiguredFestival(candidate.festival_name))
      .map((candidate) =>
        markOutOfScopeFestivalCandidate({
          ...candidate,
          film_title: film.title,
        })
      ),
  ];

  /** @type {FestivalEvidenceCandidate[]} */
  let allCandidates = [
    ...scopedLegacy.inScope,
    ...evaluatedWikipedia,
  ].map((candidate) => ({
    ...candidate,
    film_title: candidate.film_title ?? film.title,
  }));

  /** @type {FestivalEvidenceCandidate[]} */
  let festivalFilterSkipped = [];

  if (festivalFilterId) {
    const filtered = filterCandidatesByFestivalId(allCandidates, festivalFilterId);
    allCandidates = filtered.matched;
    festivalFilterSkipped = filtered.filteredOut.map((candidate) => ({
      ...candidate,
      film_title: candidate.film_title ?? film.title,
    }));
  }

  const { importableCandidates, importable } =
    rebuildImportableFromCandidates(allCandidates);

  return {
    allCandidates,
    outOfScopeSkipped,
    festivalFilterSkipped,
    importableCandidates,
    importable,
  };
}

/**
 * @param {FestivalEvidenceCandidate[]} rows
 */
export function summarizeEvidenceStatuses(rows) {
  return rows.reduce(
    (summary, row) => {
      summary[row.evidence_status] = (summary[row.evidence_status] ?? 0) + 1;
      if (shouldImportCandidate(row)) {
        summary.importable = (summary.importable ?? 0) + 1;
      }
      return summary;
    },
    /** @type {Record<string, number>} */ ({})
  );
}

// Backward-compatible aliases used in older tests/scripts.
export const extractLegacyCatalogRecognitions = extractLegacyCatalogCandidates;
export const parseOpenAiFestivalExtraction = parseWikipediaExtractionCandidates;
export const dedupeBackfillRecognitions = dedupeCandidates;
export const rankAndLimitFestivalRecognitions = rankAndLimitImportableCandidates;

export {
  hasExplicitAwardEvidence,
  hasExplicitPremiereEvidence,
  hasExplicitSelectionEvidence,
  requiresOfficialCorroboration,
};
