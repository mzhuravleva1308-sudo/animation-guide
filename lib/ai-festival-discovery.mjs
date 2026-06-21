import {
  isCandidateForFestival,
  isLikelyFilmFestivalName,
  canonicalFestivalKey,
} from "./backfill-film-festival-recognitions.mjs";
import { EVIDENCE_STATUSES } from "./festival-evidence-quality.mjs";
import { RECOGNITION_TYPE_POSSIBLE } from "./film-festival-claim.mjs";
import { normalizeOptionalText } from "./film-festival-recognition.mjs";

export const AI_DISCOVERY_SOURCE = "ai_discovery_v1";
export const AI_DISCOVERY_MODEL = "gpt-4o-mini";

export const AI_DISCOVERY_MAJOR_FESTIVALS = [
  "Cannes Film Festival",
  "Berlin International Film Festival (Berlinale)",
  "Venice Film Festival",
  "Toronto International Film Festival (TIFF)",
  "Sundance Film Festival",
  "Annecy International Animation Film Festival",
  "Tokyo Anime Award Festival",
  "Ottawa International Animation Festival",
  "Hiroshima International Animation Festival",
];

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
    : `Check whether this animated film plausibly participated at ANY of these festivals (premiere, competition, official selection, or major sidebar):
${AI_DISCOVERY_MAJOR_FESTIVALS.map((name) => `- ${name}`).join("\n")}

Also include other credible international film or animation festivals when participation is well known.`;

  return `
Assess festival participation for this animated film using public knowledge.

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
  "festivals": [
    {
      "festivalName": string,
      "festivalYear": number | null,
      "confidence": "high" | "medium",
      "reason": string
    }
  ]
}

Rules:
- Return one entry per festival where participation is plausible from public knowledge or catalog hints.
- Include major general festivals (e.g. Cannes, Berlinale, TIFF) when the film premiered or competed there — not only animation-only festivals.
- Count ONLY this film's screening, premiere, or official/sidebar selection in a festival program (Competition, Un Certain Regard, Directors' Fortnight, Official Selection, etc.).
- Do NOT count Marché du Film, market pitches, producer showcases, or a director's other projects as festival participation for this film.
- Do NOT count Annecy Animation Showcase events held during Cannes market unless this specific film screened in that showcase.
- Do NOT invent specific awards, sections, or nomination names.
- festivalYear is the festival edition year (not necessarily release year).
- Use confidence "high" for well-documented participation; "medium" for plausible but less certain.
- Return an empty festivals array only when you find no plausible festival participation.
- reason must briefly explain the hint (one sentence).
`.trim();
}

/**
 * @param {unknown} item
 * @param {{ filmTitle?: string, festivalFilterId?: string | null }} options
 * @returns {FestivalEvidenceCandidate | null}
 */
function parseAiFestivalItem(item, options = {}) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const confidence = String(item.confidence ?? "medium").toLowerCase();
  if (confidence !== "high" && confidence !== "medium") {
    return null;
  }

  const festivalName = item.festivalName ?? item.festival_name;
  if (!isLikelyFilmFestivalName(festivalName)) {
    return null;
  }

  if (
    options.festivalFilterId &&
    !isCandidateForFestival({ festival_name: festivalName }, options.festivalFilterId)
  ) {
    return null;
  }

  return {
    festival_name: festivalName,
    festival_year: item.festivalYear ?? item.festival_year ?? null,
    section: normalizeOptionalText(item.section ?? item.programme ?? item.program),
    recognition_type: RECOGNITION_TYPE_POSSIBLE,
    award_name: null,
    award_level: null,
    source_url: null,
    source_label: "OpenAI inference",
    source_type: "ai_inference",
    original_text: normalizeOptionalText(item.reason ?? item.original_text ?? item.originalText),
    evidence_status: EVIDENCE_STATUSES.NEEDS_REVIEW,
    acceptance_reason: `Possibly at festival (${confidence} confidence); awaiting official presence check.`,
    importable: false,
    film_title: options.filmTitle,
    discovery_source: AI_DISCOVERY_SOURCE,
  };
}

/**
 * @param {FestivalEvidenceCandidate[]} candidates
 */
export function dedupeAiCandidatesByFestival(candidates) {
  /** @type {Map<string, FestivalEvidenceCandidate>} */
  const byFestival = new Map();

  for (const candidate of candidates) {
    const key =
      canonicalFestivalKey(candidate.festival_name) ||
      normalizeOptionalText(candidate.festival_name)?.toLowerCase() ||
      candidate.festival_name;

    const existing = byFestival.get(key);
    if (
      !existing ||
      (candidate.festival_year != null && existing.festival_year == null)
    ) {
      byFestival.set(key, candidate);
    }
  }

  return [...byFestival.values()];
}

/**
 * @param {unknown} payload
 * @param {{ filmTitle?: string, festivalFilterId?: string | null }} [options]
 * @returns {FestivalEvidenceCandidate[]}
 */
export function parseAiFestivalsList(payload, options = {}) {
  const root = payload && typeof payload === "object" ? payload : {};
  const items = Array.isArray(root.festivals) ? root.festivals : [];

  return dedupeAiCandidatesByFestival(
    items
      .map((item) => parseAiFestivalItem(item, options))
      .filter((candidate) => candidate != null)
  );
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

  const candidate = parseAiFestivalItem(
    {
      festivalName,
      festivalYear: root.festivalYear ?? root.festival_year ?? null,
      confidence,
      reason: root.reason,
    },
    options
  );

  return candidate ? [candidate] : [];
}

/**
 * @param {unknown} payload
 * @param {{ filmTitle?: string, festivalFilterId?: string | null }} [options]
 * @returns {FestivalEvidenceCandidate[]}
 */
export function parseAiDiscoveryCandidates(payload, options = {}) {
  const fromFestivalsList = parseAiFestivalsList(payload, options);
  if (fromFestivalsList.length > 0) {
    return fromFestivalsList;
  }

  const fromLegacyBoolean = parseAiPossibleParticipation(payload, options);
  if (fromLegacyBoolean.length > 0) {
    return fromLegacyBoolean;
  }

  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.recognitions)
      ? payload.recognitions
      : [];

  return dedupeAiCandidatesByFestival(
    items
      .map((item) =>
        parseAiFestivalItem(
          {
            festivalName: item?.festival_name ?? item?.festivalName,
            festivalYear: item?.festival_year ?? item?.festivalYear,
            confidence: item?.confidence ?? "high",
            reason: item?.original_text ?? item?.originalText,
            section: item?.section ?? item?.programme ?? item?.program,
          },
          options
        )
      )
      .filter((candidate) => candidate != null)
  );
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
          "You identify plausible festival participation for animated films from public knowledge. Include major general festivals (Cannes, Berlinale, TIFF, Sundance, Venice) when the film itself screened in an official or sidebar program — not market events or unrelated director projects. Return only JSON. Never invent awards or nomination details.",
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

  return parseAiDiscoveryCandidates(payload, {
    filmTitle: film.title,
    festivalFilterId: options.festivalFilterId ?? null,
  });
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
