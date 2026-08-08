/**
 * Last-resort AI technique inference for discovery candidates.
 *
 * Runs only after source/TMDB/web/Wikipedia research produced no
 * persistable technique evidence. Never invents free-text methods outside
 * the catalog allowlist. Always marked tier=ai for verify-before-approval.
 */

import { callDiscoveryChat } from "./film-discovery-workflow.mjs";
import {
  CATALOG_TECHNIQUE_CANONICAL,
  classifyTechniqueLabel,
  isDistinctiveTechniqueLabel,
  normalizeTechniqueKey,
  TECHNIQUE_SYNONYM_MAP,
} from "./film-discovery-technique.mjs";

export const AI_TECHNIQUE_VERIFY_NOTE =
  "Technique suggested by AI from identity/context; verify before approval.";

const ALLOWED_LABELS = CATALOG_TECHNIQUE_CANONICAL.filter(
  (label, index, arr) =>
    arr.findIndex((item) => item.toLowerCase() === label.toLowerCase()) === index
);

/**
 * @param {{
 *   title: string,
 *   original_title?: string | null,
 *   year?: number | null,
 *   directors?: string[],
 *   countries?: string[],
 * }} film
 * @param {{
 *   tmdbOverview?: string | null,
 *   researchNotes?: string[],
 *   webSearchUrls?: string[],
 *   wikipediaTitle?: string | null,
 * }} [context]
 */
export function buildTechniqueAiPrompt(film, context = {}) {
  return {
    system: `You infer animation production technique for Resonale film cards.
Return JSON only:
{
  "technique": string | null,
  "confidence": "high" | "medium" | "low",
  "abstain": boolean,
  "rationale": string
}

Rules:
- technique MUST be one of the allowed catalog labels exactly, or null.
- These candidates are already confirmed animated features. Prefer a best catalog guess over abstain.
- Set abstain=true only if you truly cannot choose among allowed labels.
- Prefer distinctive methods (rotoscope, stop-motion, painted, cut-out, claymation, mixed techniques, etc.) when known.
- If no distinctive method is known, choose the most likely conventional label: hand-drawn animation, 2D animation, 2D computer animation, or 3D computer animation.
- Never invent labels outside the allowlist. Rationale max 25 words.`,
    user: `Film:
title: ${film.title}
original_title: ${film.original_title ?? ""}
year: ${film.year ?? ""}
directors: ${(film.directors ?? []).join(", ")}
countries: ${(film.countries ?? []).join(", ")}

TMDB overview (may be empty):
${context.tmdbOverview ?? "(none)"}

Prior research notes:
${(context.researchNotes ?? []).slice(0, 12).join("; ") || "(none)"}

Web URLs already checked:
${(context.webSearchUrls ?? []).slice(0, 6).join("\n") || "(none)"}

Wikipedia match title: ${context.wikipediaTitle ?? "(none)"}

Allowed technique labels:
${ALLOWED_LABELS.join(" | ")}
`,
  };
}

/**
 * @param {unknown} raw
 * @returns {{
 *   technique: string | null,
 *   confidence: "high" | "medium" | "low",
 *   abstain: boolean,
 *   rationale: string,
 *   accepted: boolean,
 *   rejectReason: string | null,
 * }}
 */
export function normalizeTechniqueAiResponse(raw) {
  const row = raw && typeof raw === "object" ? raw : {};
  const confidenceRaw = String(row.confidence ?? "low").toLowerCase();
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "medium"
      ? confidenceRaw
      : "low";
  const abstain = Boolean(row.abstain);
  const rationale = String(row.rationale ?? "").trim().slice(0, 220);
  const proposed = String(row.technique ?? "").trim();

  if (abstain || !proposed) {
    return {
      technique: null,
      confidence,
      abstain: true,
      rationale,
      accepted: false,
      rejectReason: abstain ? "abstain" : "empty_technique",
    };
  }

  const key = normalizeTechniqueKey(proposed);
  const classified = classifyTechniqueLabel(proposed);
  const normalized =
    classified.kind === "synonym" || classified.kind === "canonical"
      ? classified.normalized
      : TECHNIQUE_SYNONYM_MAP[key] ??
        ALLOWED_LABELS.find((label) => label.toLowerCase() === key) ??
        null;

  if (!normalized) {
    return {
      technique: null,
      confidence,
      abstain: true,
      rationale,
      accepted: false,
      rejectReason: "label_not_allowed",
    };
  }

  // Accept high/medium/low — AI is last resort and always verify-noted.
  return {
    technique: normalized,
    confidence,
    abstain: false,
    rationale,
    accepted: true,
    rejectReason: null,
  };
}

/**
 * Convert accepted AI inference into techniqueEvidence rows.
 * @param {ReturnType<typeof normalizeTechniqueAiResponse>} normalized
 */
export function techniqueAiResponseToEvidence(normalized) {
  if (!normalized?.accepted || !normalized.technique) return [];
  const label = normalized.technique;
  return [
    {
      label,
      sourceUrl: null,
      sourceLabel: "AI technique inference",
      evidenceSummary: normalized.rationale || AI_TECHNIQUE_VERIFY_NOTE,
      confidence:
        normalized.confidence === "high"
          ? 0.55
          : normalized.confidence === "medium"
            ? 0.4
            : 0.2,
      tier: "ai",
      patternId: "ai_inference",
      possibleNew: false,
      distinctive: isDistinctiveTechniqueLabel(label),
      ai: true,
      aiConfidence: normalized.confidence,
    },
  ];
}

/**
 * @param {object} film
 * @param {object} [context]
 * @param {{
 *   llmFn?: (prompt: { system: string, user: string }) => Promise<object>,
 *   openai?: import("openai").default,
 *   enabled?: boolean,
 * }} [options]
 */
export async function inferTechniqueViaAi(film, context = {}, options = {}) {
  if (options.enabled === false) {
    return {
      evidence: [],
      normalized: null,
      researchNotes: ["ai_technique_disabled"],
    };
  }

  const prompt = buildTechniqueAiPrompt(film, context);
  if (options.requireGuess) {
    prompt.system += `

Hard requirement for this call: abstain=false. You MUST pick the single most likely allowed technique label. Prefer hand-drawn animation or 2D animation if unsure.`;
  }

  /** @type {(prompt: { system: string, user: string }) => Promise<object>} */
  const llmFn =
    options.llmFn ??
    (async (request) => {
      if (!options.openai) {
        throw new Error("openai_or_llmFn_required");
      }
      return callDiscoveryChat(options.openai, request);
    });

  try {
    const raw = await llmFn(prompt);
    let normalized = normalizeTechniqueAiResponse(raw);
    if (!normalized.accepted && options.requireGuess && normalized.technique) {
      normalized = {
        ...normalized,
        abstain: false,
        accepted: true,
        rejectReason: null,
      };
    }
    if (!normalized.accepted && options.requireGuess) {
      // Absolute last resort for confirmed animated features.
      normalized = {
        technique: "2D animation",
        confidence: "low",
        abstain: false,
        rationale: "Fallback conventional technique after research and AI abstain.",
        accepted: true,
        rejectReason: null,
      };
    }
    if (!normalized.accepted) {
      return {
        evidence: [],
        normalized,
        researchNotes: [
          `ai_technique_${normalized.rejectReason ?? "rejected"}`,
        ],
      };
    }
    return {
      evidence: techniqueAiResponseToEvidence(normalized),
      normalized,
      researchNotes: [
        `ai_technique_accepted:${normalized.technique}:${normalized.confidence}`,
      ],
    };
  } catch (error) {
    return {
      evidence: [],
      normalized: null,
      researchNotes: [
        /openai_or_llmFn_required/i.test(String(error?.message ?? ""))
          ? "ai_technique_unavailable"
          : "ai_technique_error",
      ],
    };
  }
}
