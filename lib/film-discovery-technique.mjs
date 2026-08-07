/**
 * Normalize discovery technique labels against Resonale catalog usage.
 *
 * films.technique is free comma-separated text (not a closed enum).
 * Goals:
 * - normalize common synonyms to existing catalog forms;
 * - allow a confirmed new production-method label when taxonomy does not cover it;
 * - flag visual-style / unconfirmed / misclassified labels for manual review;
 * - split unresolved extras into non-blocking soft notes vs blocking uncertainty.
 */

import { getFilmTechniquePills } from "./film-technique.mjs";

/** Canonical labels preferred in catalog (display casing). */
export const CATALOG_TECHNIQUE_CANONICAL = Object.freeze([
  "2D animation",
  "2D computer animation",
  "hand-drawn animation",
  "traditional animation",
  "anime",
  "stop-motion animation",
  "stop motion",
  "puppet animation",
  "claymation",
  "3D computer animation",
  "3D animation",
  "rotoscoped animation",
  "rotoscope",
  "Rotoscope",
  "animated documentary",
  "silhouette animation",
  "cut-out animation",
  "painted animation",
  "mixed techniques",
  "experimental animation",
  "drawing on paper",
  "watercolor-style anime",
]);

/**
 * Map lowercase synonym → canonical display label.
 */
export const TECHNIQUE_SYNONYM_MAP = Object.freeze({
  "2d": "2D animation",
  "2d animation": "2D animation",
  "2d computer animation": "2D computer animation",
  "2d computer": "2D computer animation",
  "hand-drawn": "hand-drawn animation",
  "hand drawn": "hand-drawn animation",
  "hand-drawn animation": "hand-drawn animation",
  "hand-drawn 2d": "hand-drawn animation",
  "2d hand-drawn animation": "hand-drawn animation",
  "traditional hand-drawn animation": "hand-drawn animation",
  "traditional 2d animation": "2D animation",
  traditional: "traditional animation",
  "traditional animation": "traditional animation",
  anime: "anime",
  "2d animation / anime": "anime",
  "stop-motion": "stop-motion animation",
  "stop motion": "stop motion",
  "stop-motion animation": "stop-motion animation",
  "stop motion animation": "stop-motion animation",
  "puppet animation": "puppet animation",
  puppet: "puppet animation",
  puppets: "puppet animation",
  claymation: "claymation",
  clay: "claymation",
  "3d": "3D computer animation",
  "3d animation": "3D animation",
  "3d computer animation": "3D computer animation",
  cgi: "3D computer animation",
  rotoscope: "rotoscope",
  rotoscoping: "rotoscope",
  rotoscoped: "rotoscope",
  "rotoscoped animation": "rotoscope",
  "animated documentary": "animated documentary",
  "animation documentary": "animated documentary",
  "silhouette animation": "silhouette animation",
  silhouette: "silhouette animation",
  "cut-out animation": "cut-out animation",
  "cut out": "cut-out animation",
  "cut-out": "cut-out animation",
  "painted animation": "painted animation",
  "painted 2d animation": "painted animation",
  "digital painting": "painted animation",
  "oil-painted animation": "painted animation",
  "oil painted animation": "painted animation",
  "oil-painting-style 2d animation": "painted animation",
  "painted frames": "painted animation",
  "mixed techniques": "mixed techniques",
  "mixed media": "mixed techniques",
  "experimental animation": "experimental animation",
  experimental: "experimental animation",
  "drawing on paper": "drawing on paper",
  "paper drawing": "drawing on paper",
});

/** Labels that are style/genre/mood, not production technique. */
export const VISUAL_STYLE_NOT_TECHNIQUE = Object.freeze([
  "surreal",
  "surreal 2d",
  "surreal animation",
  "stylized",
  "stylised",
  "dark",
  "groovy",
  "psychedelic",
  "minimalist",
  "abstract",
  "noir",
  "comic",
  "cartoon",
  "graphic novel",
  "dreamlike",
  "painterly",
  "watercolor",
  "watercolour",
]);

/**
 * Contextual / audience / vague labels — never store as technique.
 * Non-blocking when dropped alongside a usable production method.
 */
export const NON_TECHNIQUE_CONTEXTUAL = Object.freeze([
  "adult animation",
  "independent animation",
  "indie animation",
  "surreal animation",
  "musical numbers",
  "musical",
  "digital animation",
  "animation",
]);

/** Broad labels that should not alone replace a distinctive method. */
export const GENERIC_TECHNIQUE_LABELS = Object.freeze([
  "2D animation",
  "3D animation",
  "traditional animation",
  "2D computer animation",
  "3D computer animation",
  "hand-drawn animation",
]);

/** Distinctive production methods that matter on the card. */
export const DISTINCTIVE_TECHNIQUE_LABELS = Object.freeze([
  "rotoscope",
  "rotoscoped animation",
  "painted animation",
  "stop-motion animation",
  "stop motion",
  "puppet animation",
  "claymation",
  "cut-out animation",
  "silhouette animation",
  "animated documentary",
  "mixed techniques",
  "experimental animation",
  "watercolor-style anime",
]);

const CANONICAL_LOWER = new Set(
  CATALOG_TECHNIQUE_CANONICAL.map((label) => label.toLowerCase())
);

const NON_TECHNIQUE_CONTEXTUAL_SET = new Set(
  NON_TECHNIQUE_CONTEXTUAL.map((label) => label.toLowerCase())
);

/**
 * @param {string} raw
 */
export function normalizeTechniqueKey(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-");
}

/**
 * @param {string} a
 * @param {string} b
 */
function tokenOverlapScore(a, b) {
  const ta = new Set(a.split(/[^a-z0-9]+/).filter((t) => t.length > 1));
  const tb = new Set(b.split(/[^a-z0-9]+/).filter((t) => t.length > 1));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const token of ta) {
    if (tb.has(token)) hit += 1;
  }
  return hit / Math.max(ta.size, tb.size);
}

/**
 * @param {string} key
 * @returns {string[]}
 */
export function findCloseTechniqueMatches(key) {
  const scored = CATALOG_TECHNIQUE_CANONICAL.map((label) => ({
    label,
    score: tokenOverlapScore(key, label.toLowerCase()),
  }))
    .filter((row) => row.score >= 0.4)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((row) => row.label);
}

/**
 * @param {string} label
 */
export function isGenericTechniqueLabel(label) {
  return GENERIC_TECHNIQUE_LABELS.some(
    (item) => item.toLowerCase() === String(label ?? "").toLowerCase()
  );
}

/**
 * @param {string} label
 */
export function isDistinctiveTechniqueLabel(label) {
  return DISTINCTIVE_TECHNIQUE_LABELS.some(
    (item) => item.toLowerCase() === String(label ?? "").toLowerCase()
  );
}

/**
 * @param {string} raw
 * @returns {{
 *   kind: "canonical" | "synonym" | "visual_style" | "contextual_non_technique" | "too_detailed" | "possible_new" | "unconfirmed",
 *   normalized: string | null,
 *   closeMatches: string[],
 *   reason: string,
 *   blockingDefault?: boolean,
 * }}
 */
export function classifyTechniqueLabel(raw) {
  const original = String(raw ?? "").trim();
  const key = normalizeTechniqueKey(original);
  if (!key) {
    return {
      kind: "unconfirmed",
      normalized: null,
      closeMatches: [],
      reason: "empty label",
      blockingDefault: false,
    };
  }

  if (TECHNIQUE_SYNONYM_MAP[key]) {
    return {
      kind: "synonym",
      normalized: TECHNIQUE_SYNONYM_MAP[key],
      closeMatches: [TECHNIQUE_SYNONYM_MAP[key]],
      reason: "mapped via synonym dictionary",
    };
  }

  if (CANONICAL_LOWER.has(key)) {
    const canonical =
      CATALOG_TECHNIQUE_CANONICAL.find((label) => label.toLowerCase() === key) ??
      original;
    return {
      kind: "canonical",
      normalized: canonical,
      closeMatches: [canonical],
      reason: "exact catalog form",
    };
  }

  if (NON_TECHNIQUE_CONTEXTUAL_SET.has(key)) {
    return {
      kind: "contextual_non_technique",
      normalized: null,
      closeMatches: findCloseTechniqueMatches(key),
      reason: "contextual / audience / vague label, not a production technique",
      blockingDefault: false,
    };
  }

  if (
    VISUAL_STYLE_NOT_TECHNIQUE.includes(key) ||
    /\b(surreal|stylized|psychedelic|dreamlike|painterly)\b/i.test(key)
  ) {
    return {
      kind: "visual_style",
      normalized: null,
      closeMatches: findCloseTechniqueMatches(key),
      reason: "visual style / aesthetic adjective, not production technique",
      blockingDefault: false,
    };
  }

  const close = findCloseTechniqueMatches(key);
  if (close.length && tokenOverlapScore(key, close[0].toLowerCase()) >= 0.6) {
    return {
      kind: "too_detailed",
      normalized: null,
      closeMatches: close,
      reason: `too specific vs existing form(s): ${close.join(", ")}`,
      blockingDefault: false,
    };
  }

  if (key.includes("/")) {
    return {
      kind: "too_detailed",
      normalized: null,
      closeMatches: findCloseTechniqueMatches(key.replace(/\//g, " ")),
      reason: "compound slash label — split into separate techniques",
      blockingDefault: false,
    };
  }

  if (
    /\b(animation|motion|puppet|clay|roto|cut-?out|cgi|documentary|drawn|paint|capture|composit)\b/i.test(
      key
    )
  ) {
    return {
      kind: "possible_new",
      normalized: original,
      closeMatches: close,
      reason: "looks like production method not yet in synonym map",
      blockingDefault: true,
    };
  }

  return {
    kind: "unconfirmed",
    normalized: null,
    closeMatches: close,
    reason: "not recognized as production technique",
    blockingDefault: false,
  };
}

/**
 * @param {string | string[] | null | undefined} input
 * @param {{
 *   maxLabels?: number,
 *   allowConfirmedNew?: boolean,
 *   confirmedNewLabels?: string[],
 * }} [options]
 */
export function normalizeDiscoveryTechniqueLabels(input, options = {}) {
  const maxLabels = options.maxLabels ?? 2;
  const allowConfirmedNew = options.allowConfirmedNew ?? true;
  const confirmedNew = new Set(
    (options.confirmedNewLabels ?? []).map((label) => normalizeTechniqueKey(label))
  );

  const parts = Array.isArray(input)
    ? input.flatMap((item) => String(item).split(","))
    : String(input ?? "").split(",");

  /** @type {string[]} */
  const labels = [];
  /** @type {object[]} */
  const diagnostics = [];
  /** @type {string[]} */
  const unknown = [];
  /** @type {string[]} */
  const nonBlockingUnknown = [];
  /** @type {string[]} */
  const blockingUnknown = [];
  /** @type {string[]} */
  const confirmedNewAccepted = [];
  /** @type {string[]} */
  const synonymHits = [];
  const seen = new Set();

  for (const part of parts) {
    if (!String(part).trim()) continue;
    const rawLabel = String(part).trim();
    const key = normalizeTechniqueKey(rawLabel);
    const classified = classifyTechniqueLabel(rawLabel);
    diagnostics.push({ raw: rawLabel, ...classified });

    if (classified.kind === "synonym" || classified.kind === "canonical") {
      const value = classified.normalized;
      if (value && !seen.has(value.toLowerCase())) {
        seen.add(value.toLowerCase());
        labels.push(value);
        if (classified.kind === "synonym") synonymHits.push(rawLabel);
      }
      continue;
    }

    if (classified.kind === "possible_new" && allowConfirmedNew) {
      const keyNorm = normalizeTechniqueKey(classified.normalized ?? rawLabel);
      if (confirmedNew.has(keyNorm) && classified.normalized) {
        const value = classified.normalized;
        if (!seen.has(value.toLowerCase())) {
          seen.add(value.toLowerCase());
          labels.push(value);
          confirmedNewAccepted.push(value);
        }
        continue;
      }
    }

    if (
      classified.kind === "too_detailed" &&
      classified.closeMatches?.[0] &&
      tokenOverlapScore(key, classified.closeMatches[0].toLowerCase()) >= 0.6
    ) {
      const value = classified.closeMatches[0];
      if (!seen.has(value.toLowerCase())) {
        seen.add(value.toLowerCase());
        labels.push(value);
        synonymHits.push(`${rawLabel}→${value}`);
      }
      continue;
    }

    unknown.push(rawLabel);
    if (
      classified.kind === "contextual_non_technique" ||
      classified.kind === "visual_style" ||
      classified.blockingDefault === false
    ) {
      nonBlockingUnknown.push(rawLabel);
    } else {
      blockingUnknown.push(rawLabel);
    }
  }

  const limited = labels.slice(0, maxLabels);
  return {
    technique: limited.length ? limited.join(", ") : null,
    labels: limited,
    unknown,
    nonBlockingUnknown,
    blockingUnknown,
    normalized: unknown.length === 0 && limited.length > 0,
    diagnostics,
    synonymHits,
    confirmedNewAccepted,
    // Empty usable technique always blocks; otherwise see resolveTechniqueStatusPolicy.
    needsReview: limited.length === 0,
  };
}

/**
 * Decide technique notes / soft uncertainty — does NOT block card readiness.
 *
 * @param {{
 *   labels: string[],
 *   diagnostics?: object[],
 *   nonBlockingUnknown?: string[],
 *   blockingUnknown?: string[],
 *   unknown?: string[],
 *   techniqueEvidence?: object[],
 *   wikipediaOnlyDistinctive?: object[],
 * }} input
 */
export function resolveTechniqueStatusPolicy(input) {
  const labels = input.labels ?? [];
  const evidence = input.techniqueEvidence ?? [];
  const nonBlocking = [...(input.nonBlockingUnknown ?? [])];
  /** @type {string[]} */
  const techniqueNotes = [];
  /** @type {object[]} */
  const provenance = [];

  for (const label of labels) {
    const matches = evidence.filter(
      (row) => String(row.label).toLowerCase() === label.toLowerCase()
    );
    if (matches.length) {
      const best = matches.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      provenance.push({
        label,
        sourceUrl: best.sourceUrl ?? null,
        sourceLabel: best.sourceLabel,
        evidenceSummary: best.evidenceSummary,
        confidence: best.confidence,
        sourceTier: best.tier ?? null,
      });
    }
  }

  const withDirectEvidence = provenance.length;
  const inferredOnly = labels.filter(
    (label) =>
      !provenance.some((row) => row.label.toLowerCase() === label.toLowerCase())
  );

  for (const label of nonBlocking) {
    techniqueNotes.push(`Dropped non-technique label: ${label}`);
  }

  for (const diag of input.diagnostics ?? []) {
    if (diag.kind === "possible_new") {
      techniqueNotes.push(
        `${diag.raw} may be significant; verify during manual review (not auto-accepted).`
      );
    }
    if (diag.kind === "contextual_non_technique" || diag.kind === "visual_style") {
      techniqueNotes.push(`Ignored non-technique proposal: ${diag.raw}`);
    }
  }

  for (const row of evidence) {
    if (!isDistinctiveTechniqueLabel(row.label) && !row.possibleNew) continue;
    const kept = labels.some(
      (label) => label.toLowerCase() === String(row.label).toLowerCase()
    );
    if (!kept) {
      techniqueNotes.push(
        `${row.label} may also be significant; verify during manual review.`
      );
    }
  }

  if (labels.length > 0 && withDirectEvidence === 0) {
    const onlyGeneric = labels.every((label) => isGenericTechniqueLabel(label));
    if (onlyGeneric) {
      techniqueNotes.push(
        "Basic technique inferred from metadata/consensus without a direct production citation."
      );
    } else {
      techniqueNotes.push(
        "Technique labels lack a direct production-method citation; verify during manual review."
      );
    }
  }

  for (const row of input.wikipediaOnlyDistinctive ?? []) {
    techniqueNotes.push(
      `${row.label ?? row} supported only by Wikipedia fallback; prefer a stronger source if possible.`
    );
  }

  for (const row of provenance) {
    if (!isDistinctiveTechniqueLabel(row.label)) continue;
    if (row.sourceTier === "wikipedia") {
      techniqueNotes.push(
        `Distinctive technique "${row.label}" is Wikipedia-backed; confirm if needed.`
      );
    }
  }

  if (labels.length === 0) {
    techniqueNotes.push("No technique label produced — fill during manual review if known.");
  }

  return {
    needsReview: false,
    blockingReasons: [],
    techniqueNotes: [...new Set(techniqueNotes)],
    nonBlockingNotes: nonBlocking,
    blockingUnknown: [],
    techniqueProvenance: provenance,
    techniqueLabelsWithDirectEvidence: withDirectEvidence,
    techniqueLabelsInferredOnly: inferredOnly.length,
    inferredLabels: inferredOnly,
    evidenceLabelCount: new Set(
      evidence.map((row) => String(row.label ?? "").toLowerCase())
    ).size,
  };
}

/**
 * Prefer evidence-backed distinctive labels; keep at most 2.
 * @param {string[]} proposedLabels
 * @param {object[]} techniqueEvidence
 */
export function preferEvidenceBackedTechniqueLabels(
  proposedLabels,
  techniqueEvidence = []
) {
  const evidenceLabels = [];
  const seen = new Set();
  for (const row of techniqueEvidence) {
    if (row.possibleNew) continue; // never auto-add possible_new
    const classified = classifyTechniqueLabel(row.label);
    const value =
      classified.kind === "synonym" || classified.kind === "canonical"
        ? classified.normalized
        : TECHNIQUE_SYNONYM_MAP[normalizeTechniqueKey(row.label)] ??
          (CANONICAL_LOWER.has(normalizeTechniqueKey(row.label))
            ? row.label
            : null);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    evidenceLabels.push(value);
  }

  const proposed = proposedLabels ?? [];
  /** @type {string[]} */
  const merged = [];
  const mergedSeen = new Set();

  // Distinctive evidence first
  for (const label of evidenceLabels) {
    if (isDistinctiveTechniqueLabel(label) && !mergedSeen.has(label.toLowerCase())) {
      mergedSeen.add(label.toLowerCase());
      merged.push(label);
    }
  }
  // Then proposed distinctive that match evidence or synonym-normalized
  for (const label of proposed) {
    if (merged.length >= 2) break;
    if (!isDistinctiveTechniqueLabel(label)) continue;
    if (mergedSeen.has(label.toLowerCase())) continue;
    const evidenced = evidenceLabels.some(
      (item) => item.toLowerCase() === label.toLowerCase()
    );
    if (evidenced) {
      mergedSeen.add(label.toLowerCase());
      merged.push(label);
    }
  }
  // Then any remaining evidence / proposed (basic technique OK without citation)
  for (const label of [...evidenceLabels, ...proposed]) {
    if (merged.length >= 2) break;
    if (mergedSeen.has(label.toLowerCase())) continue;
    mergedSeen.add(label.toLowerCase());
    merged.push(label);
  }

  return merged.slice(0, 2);
}

/**
 * @param {string | null | undefined} technique
 */
export function discoveryTechniquePills(technique) {
  return getFilmTechniquePills(technique, 2);
}
