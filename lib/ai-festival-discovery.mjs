import {
  isCandidateForFestival,
  isLikelyFilmFestivalName,
} from "./backfill-film-festival-recognitions.mjs";
import { EVIDENCE_STATUSES } from "./festival-evidence-quality.mjs";
import { RECOGNITION_TYPE_POSSIBLE } from "./film-festival-claim.mjs";
import { normalizeOptionalText } from "./film-festival-recognition.mjs";

export const AI_DISCOVERY_SOURCE = "ai_discovery_v1";
export const AI_DISCOVERY_MODEL = "gpt-4o-mini";

/**
 * @typedef {import("./festival-evidence-quality.mjs").FestivalEvidenceCandidate} FestivalEvidenceCandidate
 */

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null, director?: string | null, festival?: string | null, section?: string | null, country?: string | null }} film
 * @param {{ festivalFilterId?: string | null }} [options]
 */
export function buildAiFestivalDiscoveryPrompt(film, options = {}) {
  const festivalScope = options.festivalFilterId
    ? `Focus ONLY on whether this film plausibly participated at ${options.festivalFilterId} (Annecy International Animated Film Festival when id is annecy).`
    : "Include any major animation festival where this film plausibly participated.";

  return `
Assess whether this animated film plausibly participated at a festival.

Film metadata:
- Title: ${film.title}
- Original title: ${film.original_title ?? "unknown"}
- Year: ${film.year ?? "unknown"}
- Director: ${film.director ?? "unknown"}
- Country: ${film.country ?? "unknown"}
- Catalog festival field: ${film.festival ?? "none"}
- Catalog section field: ${film.section ?? "none"}

${festivalScope}

Return ONLY valid JSON:
{
  "possiblyAtFestival": boolean,
  "festivalName": string | null,
  "festivalYear": number | null,
  "confidence": "high" | "medium",
  "reason": string
}

Rules:
- Set possiblyAtFestival true only when participation is plausible from public knowledge or catalog hints.
- Do NOT invent specific awards, sections, or nomination names.
- festivalYear is a best guess for the festival edition year (not necessarily release year).
- Return possiblyAtFestival false when uncertain.
- reason must briefly explain the hint (one sentence).
`.trim();
}

/**
 * @param {unknown} payload
 * @param {{ filmTitle?: string, festivalFilterId?: string | null }} [options]
 * @returns {FestivalEvidenceCandidate[]}
 */
export function parseAiPossibleParticipation(payload, options = {}) {
  const root = payload && typeof payload === "object" ? payload : {};
  const confidence = String(root.confidence ?? "medium").toLowerCase();
  if (confidence !== "high" && confidence !== "medium") {
    return [];
  }

  if (root.possiblyAtFestival !== true && root.possiblyAtFestival !== "true") {
    return [];
  }

  const festivalName =
    root.festivalName ??
    (options.festivalFilterId === "annecy"
      ? "Annecy International Animated Film Festival"
      : null);

  if (!isLikelyFilmFestivalName(festivalName)) {
    return [];
  }

  if (
    options.festivalFilterId &&
    !isCandidateForFestival({ festival_name: festivalName }, options.festivalFilterId)
  ) {
    return [];
  }

  return [
    {
      festival_name: festivalName,
      festival_year: root.festivalYear ?? root.festival_year ?? null,
      section: null,
      recognition_type: RECOGNITION_TYPE_POSSIBLE,
      award_name: null,
      award_level: null,
      source_url: null,
      source_label: "OpenAI inference",
      source_type: "ai_inference",
      original_text: normalizeOptionalText(root.reason),
      evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW,
      acceptance_reason: `Possibly at festival (${confidence} confidence); awaiting official presence check.`,
      importable: false,
      film_title: options.filmTitle,
      discovery_source: AI_DISCOVERY_SOURCE,
    },
  ];
}

/**
 * @param {unknown} payload
 * @param {{ filmTitle?: string, festivalFilterId?: string | null }} [options]
 * @returns {FestivalEvidenceCandidate[]}
 */
export function parseAiDiscoveryCandidates(payload, options = {}) {
  const possible = parseAiPossibleParticipation(payload, options);
  if (possible.length > 0) {
    return possible;
  }

  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.recognitions)
      ? payload.recognitions
      : [];

  /** @type {FestivalEvidenceCandidate[]} */
  const candidates = [];

  for (const item of items) {
    const confidence = String(item?.confidence ?? "high").toLowerCase();
    if (confidence !== "high" && confidence !== "medium") {
      continue;
    }

    const festivalName = item?.festival_name ?? item?.festivalName;
    if (!isLikelyFilmFestivalName(festivalName)) {
      continue;
    }

    if (
      options.festivalFilterId &&
      !isCandidateForFestival({ festival_name: festivalName }, options.festivalFilterId)
    ) {
      continue;
    }

    candidates.push({
      festival_name: festivalName,
      festival_year: item?.festival_year ?? item?.festivalYear ?? null,
      section: normalizeOptionalText(item?.section ?? item?.programme ?? item?.program),
      recognition_type: RECOGNITION_TYPE_POSSIBLE,
      award_name: null,
      award_level: null,
      source_url: null,
      source_label: "OpenAI inference",
      source_type: "ai_inference",
      original_text: normalizeOptionalText(item?.original_text ?? item?.originalText),
      evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW,
      acceptance_reason: `Possibly at festival (${confidence} confidence); awaiting official presence check.`,
      importable: false,
      film_title: options.filmTitle,
      discovery_source: AI_DISCOVERY_SOURCE,
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  const best = candidates.find((candidate) => candidate.festival_year != null) ?? candidates[0];
  return [best];
}

/**
 * @param {import("openai").OpenAI} client
 * @param {{ title: string, original_title?: string | null, year?: number | null, director?: string | null, festival?: string | null, section?: string | null, country?: string | null }} film
 * @param {{ festivalFilterId?: string | null }} [options]
 */
export async function extractAiFestivalCandidates(client, film, options = {}) {
  const prompt = buildAiFestivalDiscoveryPrompt(film, options);

  const response = await client.responses.create({
    model: AI_DISCOVERY_MODEL,
    input: [
      {
        role: "system",
        content:
          "You assess conservative festival participation hints from film metadata. Return only JSON. Never invent awards or nomination details.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  let payload;
  try {
    payload = JSON.parse(response.output_text);
  } catch {
    return [];
  }

  const aiCandidates = parseAiDiscoveryCandidates(payload, {
    filmTitle: film.title,
    festivalFilterId: options.festivalFilterId ?? null,
  });

  return aiCandidates;
}

/**
 * @param {FestivalEvidenceCandidate[]} candidates
 * @param {string | null | undefined} festivalFilterId
 */
export function filterAiCandidatesByFestival(candidates, festivalFilterId) {
  if (!festivalFilterId) {
    return candidates;
  }

  return candidates.filter((candidate) =>
    isCandidateForFestival(candidate, festivalFilterId)
  );
}
