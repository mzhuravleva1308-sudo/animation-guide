/**
 * Compact exclusion index + Unicode-safe identity matching for weekly discovery.
 * Manager never uses this — Researcher pre-filters; Eligibility re-checks independently.
 */

import { getTitleSimilarity } from "./film-duplicate-check.mjs";
import {
  DISCOVERY_REJECT_REASON,
  DISCOVERY_REVIEW_STATUS,
  DISCOVERY_SOURCE,
  isPermanentRejectReason,
  isRetriableRejectReason,
} from "./film-discovery.mjs";

const LEADING_ARTICLE_PATTERN =
  /^(the|a|an|le|la|les|l|el|los|las|un|une|des|der|die|das)\s+/;

export const EXCLUSION_ENTRY_SOURCE = Object.freeze({
  films: "films",
  discoveryCandidates: "film_discovery_candidates",
  workflowRound: "workflow_round",
});

/** Near-miss signal only. Exact normalized matches are hard-deduped first.
 * getTitleSimilarity tops out below ~86 for non-equal strings, so 80 catches
 * strong word-overlap near-misses without auto-rejecting them.
 */
export const FUZZY_REVIEW_THRESHOLD = 80;

/**
 * Unicode-safe title normalization for discovery dedupe.
 * Keeps letters from any script (Hangul, CJK, etc.). Empty result must not be a dedupe key.
 *
 * @param {string | null | undefined} value
 * @param {{ stripArticles?: boolean }} [options]
 */
export function normalizeDiscoveryIdentityString(
  value,
  { stripArticles = true } = {}
) {
  if (value == null) return "";
  const raw = String(value);
  if (!raw.trim()) return "";

  let normalized = raw
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[''""]/g, "")
    .replace(/\s*&\s*/g, " and ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripArticles) {
    while (LEADING_ARTICLE_PATTERN.test(normalized)) {
      normalized = normalized.replace(LEADING_ARTICLE_PATTERN, "").trim();
    }
  }

  return normalized;
}

/**
 * Exact Unicode compare after NFKC + case fold (preserves non-Latin).
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 */
export function unicodeTitlesEqual(a, b) {
  if (a == null || b == null) return false;
  const left = String(a).normalize("NFKC").toLowerCase().trim();
  const right = String(b).normalize("NFKC").toLowerCase().trim();
  return Boolean(left) && left === right;
}

/**
 * @param {object} row
 * @param {{
 *   source: string,
 *   reject_reason?: string | null,
 *   source_urls?: string[] | null,
 *   exclusion_mode?: 'hard' | 'retriable',
 * }} meta
 */
export function buildExclusionEntry(row, meta) {
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const original_title =
    typeof row.original_title === "string" && row.original_title.trim()
      ? row.original_title.trim()
      : null;
  const year = Number(row.year);
  const aliases = Array.isArray(row.aliases)
    ? [...new Set(row.aliases.map((item) => String(item).trim()).filter(Boolean))]
    : [];

  // Title/original are mutual aliases for matching when both present.
  if (original_title && original_title !== title && !aliases.includes(original_title)) {
    // keep aliases as provided only — mutual match handled in matcher via cross fields
  }

  const reject_reason =
    typeof meta.reject_reason === "string" && meta.reject_reason.trim()
      ? meta.reject_reason.trim()
      : null;

  const exclusion_mode =
    meta.exclusion_mode ??
    (reject_reason && isRetriableRejectReason(reject_reason)
      ? "retriable"
      : "hard");

  return {
    title,
    original_title,
    year: Number.isInteger(year) ? year : null,
    aliases,
    source: meta.source,
    reject_reason,
    exclusion_mode,
    source_urls: Array.isArray(meta.source_urls)
      ? meta.source_urls.filter((url) => typeof url === "string" && url.trim())
      : Array.isArray(row.source_urls)
        ? row.source_urls.filter((url) => typeof url === "string" && url.trim())
        : [],
    normalized_title: normalizeDiscoveryIdentityString(title),
    normalized_original_title: normalizeDiscoveryIdentityString(original_title),
  };
}

/**
 * @param {object[]} films
 */
export function buildExclusionEntriesFromFilms(films) {
  return (films ?? [])
    .map((film) =>
      buildExclusionEntry(film, { source: EXCLUSION_ENTRY_SOURCE.films })
    )
    .filter((entry) => entry.title && entry.year != null);
}

/**
 * Staging rows → exclusion entries (pending/approved/permanent rejected/retriable).
 * @param {object[]} candidates
 */
export function buildExclusionEntriesFromCandidates(candidates) {
  /** @type {ReturnType<typeof buildExclusionEntry>[]} */
  const entries = [];

  for (const row of candidates ?? []) {
    const status = row.review_status;
    if (
      status === DISCOVERY_REVIEW_STATUS.pendingReview ||
      status === DISCOVERY_REVIEW_STATUS.approved
    ) {
      entries.push(
        buildExclusionEntry(row, {
          source: EXCLUSION_ENTRY_SOURCE.discoveryCandidates,
          reject_reason: null,
          exclusion_mode: "hard",
          source_urls: row.source_urls,
        })
      );
      continue;
    }

    if (status === DISCOVERY_REVIEW_STATUS.rejected) {
      const reason = row.reject_reason ?? null;
      if (isRetriableRejectReason(reason)) {
        entries.push(
          buildExclusionEntry(row, {
            source: EXCLUSION_ENTRY_SOURCE.discoveryCandidates,
            reject_reason: reason,
            exclusion_mode: "retriable",
            source_urls: row.source_urls,
          })
        );
      } else {
        // Permanent codes and unknown reasons → hard exclude.
        entries.push(
          buildExclusionEntry(row, {
            source: EXCLUSION_ENTRY_SOURCE.discoveryCandidates,
            reject_reason: reason,
            exclusion_mode: "hard",
            source_urls: row.source_urls,
          })
        );
      }
    }
  }

  return entries.filter((entry) => entry.title && entry.year != null);
}

/**
 * @param {object[]} candidates — workflow-round candidates (passed or permanent fails)
 * @param {{ permanentOnly?: boolean }} [options]
 */
export function buildExclusionEntriesFromWorkflowRound(
  candidates,
  options = {}
) {
  return (candidates ?? [])
    .map((item) => {
      const candidate = item.candidate ?? item;
      const review = item.review;
      const reasonCode =
        review?.reason_code ??
        (review?.reasons ?? []).find((reason) =>
          Object.values(DISCOVERY_REJECT_REASON).includes(reason)
        ) ??
        null;

      if (options.permanentOnly) {
        const isDup = reasonCode === DISCOVERY_REJECT_REASON.duplicate;
        const isPermanent =
          isDup || (reasonCode && isPermanentRejectReason(reasonCode));
        if (!isPermanent && reasonCode) return null;
        // Permanent structural fails without code still excluded by identity via caller
      }

      return buildExclusionEntry(candidate, {
        source: EXCLUSION_ENTRY_SOURCE.workflowRound,
        reject_reason: reasonCode,
        exclusion_mode: "hard",
        source_urls: candidate.source_urls,
      });
    })
    .filter(Boolean)
    .filter((entry) => entry.title && entry.year != null);
}

/**
 * @param  {...ReturnType<typeof buildExclusionEntry>[]} groups
 */
export function mergeExclusionIndexes(...groups) {
  return groups.flat();
}

/**
 * Compact payload for Researcher tooling (includes source for programmatic use).
 * @param {ReturnType<typeof buildExclusionEntry>[]} index
 */
export function formatExclusionIndexForResearcher(index) {
  return (index ?? []).map((entry) => ({
    title: entry.title,
    original_title: entry.original_title,
    year: entry.year,
    aliases: entry.aliases ?? [],
    source: entry.source,
    ...(entry.reject_reason ? { reject_reason: entry.reject_reason } : {}),
    ...(entry.exclusion_mode === "retriable"
      ? { exclusion_mode: "retriable" }
      : {}),
  }));
}

/**
 * Prompt-only lines: title / original_title (year). No card fields.
 * Dedupes identical title+original+year lines while preserving order.
 *
 * @param {Array<{ title?: string | null, original_title?: string | null, year?: number | null, source?: string }>} index
 */
export function formatExclusionListForPrompt(index) {
  /** @type {string[]} */
  const lines = [];
  const seen = new Set();

  for (const entry of index ?? []) {
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title || entry.year == null) continue;
    const original =
      typeof entry.original_title === "string" && entry.original_title.trim()
        ? entry.original_title.trim()
        : null;
    const line = original
      ? `- ${title} / ${original} (${entry.year})`
      : `- ${title} (${entry.year})`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * @param {ReturnType<typeof buildExclusionEntry>[]} index
 */
export function summarizeExclusionIndexSources(index) {
  let films = 0;
  let staging = 0;
  let workflowRound = 0;
  for (const entry of index ?? []) {
    if (entry.source === EXCLUSION_ENTRY_SOURCE.films) films += 1;
    else if (entry.source === EXCLUSION_ENTRY_SOURCE.discoveryCandidates) {
      staging += 1;
    } else if (entry.source === EXCLUSION_ENTRY_SOURCE.workflowRound) {
      workflowRound += 1;
    }
  }
  return {
    total: (index ?? []).length,
    films,
    staging,
    workflow_round: workflowRound,
  };
}

/**
 * Rough prompt size estimate (chars + ~4 chars/token heuristic).
 * @param {string} prompt
 */
export function estimatePromptSize(prompt) {
  const characters = String(prompt ?? "").length;
  return {
    characters,
    estimated_tokens: Math.ceil(characters / 4),
  };
}

/**
 * @param {string[]} candidateUrls
 * @param {string[]} priorUrls
 */
export function hasNewSourceEvidence(candidateUrls, priorUrls) {
  const prior = new Set(
    (priorUrls ?? []).map((url) => String(url).trim().toLowerCase())
  );
  return (candidateUrls ?? []).some(
    (url) => url && !prior.has(String(url).trim().toLowerCase())
  );
}

/**
 * Hard / fuzzy match against exclusion index.
 * Empty normalized values never participate as dedupe keys.
 *
 * @param {{ title: string, original_title?: string | null, year: number, aliases?: string[], source_urls?: string[] }} candidate
 * @param {ReturnType<typeof buildExclusionEntry>[]} index
 * @returns {{
 *   hard: null | { kind: string, entry: object },
 *   fuzzy: null | { kind: string, entry: object, similarity: number },
 * }}
 */
export function matchAgainstExclusionIndex(candidate, index) {
  const year = Number(candidate.year);
  const titleNorm = normalizeDiscoveryIdentityString(candidate.title);
  const originalNorm = normalizeDiscoveryIdentityString(candidate.original_title);
  const candidateAliases = [
    ...(Array.isArray(candidate.aliases) ? candidate.aliases : []),
  ];

  /** @type {null | { kind: string, entry: object }} */
  let hard = null;
  /** @type {null | { kind: string, entry: object, similarity: number }} */
  let fuzzy = null;

  for (const entry of index ?? []) {
    if (entry.year == null || Number(entry.year) !== year) continue;

    const entryTitleNorm =
      entry.normalized_title || normalizeDiscoveryIdentityString(entry.title);
    const entryOriginalNorm =
      entry.normalized_original_title ||
      normalizeDiscoveryIdentityString(entry.original_title);

    // Exact Unicode title / original (including non-Latin)
    if (unicodeTitlesEqual(candidate.title, entry.title)) {
      hard = { kind: "unicode_title_year", entry };
      break;
    }
    if (
      candidate.original_title &&
      entry.original_title &&
      unicodeTitlesEqual(candidate.original_title, entry.original_title)
    ) {
      hard = { kind: "unicode_original_title_year", entry };
      break;
    }

    // Normalized keys only when non-empty
    if (titleNorm && entryTitleNorm && titleNorm === entryTitleNorm) {
      hard = { kind: "title_year", entry };
      break;
    }
    if (originalNorm && entryOriginalNorm && originalNorm === entryOriginalNorm) {
      hard = { kind: "original_title_year", entry };
      break;
    }
    if (titleNorm && entryOriginalNorm && titleNorm === entryOriginalNorm) {
      hard = { kind: "title_matches_original_year", entry };
      break;
    }
    if (originalNorm && entryTitleNorm && originalNorm === entryTitleNorm) {
      hard = { kind: "original_matches_title_year", entry };
      break;
    }

    // Alias + year
    const entryAliases = entry.aliases ?? [];
    for (const alias of [...candidateAliases, candidate.title, candidate.original_title]) {
      if (!alias) continue;
      const aliasNorm = normalizeDiscoveryIdentityString(alias);
      for (const existingAlias of [
        ...entryAliases,
        entry.title,
        entry.original_title,
      ]) {
        if (!existingAlias) continue;
        if (unicodeTitlesEqual(alias, existingAlias)) {
          hard = { kind: "alias_year", entry };
          break;
        }
        const existingAliasNorm = normalizeDiscoveryIdentityString(existingAlias);
        if (aliasNorm && existingAliasNorm && aliasNorm === existingAliasNorm) {
          hard = { kind: "alias_year", entry };
          break;
        }
      }
      if (hard) break;
    }
    if (hard) break;

    // Fuzzy — signal only
    const titleSim = getTitleSimilarity(
      // Prefer discovery normalize for similarity inputs that keep Latin; fall back to raw
      candidate.title,
      entry.title
    );
    if (titleSim >= FUZZY_REVIEW_THRESHOLD) {
      if (!fuzzy || titleSim > fuzzy.similarity) {
        fuzzy = { kind: "fuzzy_title_year", entry, similarity: titleSim };
      }
    }
    if (candidate.original_title && entry.original_title) {
      const originalSim = getTitleSimilarity(
        candidate.original_title,
        entry.original_title
      );
      if (originalSim >= FUZZY_REVIEW_THRESHOLD) {
        if (!fuzzy || originalSim > fuzzy.similarity) {
          fuzzy = {
            kind: "fuzzy_original_year",
            entry,
            similarity: originalSim,
          };
        }
      }
    }
  }

  if (hard?.entry?.exclusion_mode === "retriable") {
    const allowed = hasNewSourceEvidence(
      candidate.source_urls ?? [],
      hard.entry.source_urls ?? []
    );
    if (allowed) {
      // Retriable with new sources — not a hard block
      return { hard: null, fuzzy };
    }
  }

  return { hard, fuzzy };
}

/**
 * Researcher must drop hard matches before returning results.
 * Fuzzy matches are kept but flagged for additional verification.
 *
 * @param {import("./film-discovery.mjs").ResearcherCandidate[]} candidates
 * @param {ReturnType<typeof buildExclusionEntry>[]} index
 */
export function filterResearcherCandidatesAgainstIndex(candidates, index) {
  /** @type {import("./film-discovery.mjs").ResearcherCandidate[]} */
  const accepted = [];
  /** @type {Array<{ candidate: object, reason: string, matched: object }>} */
  const rejected = [];

  for (const candidate of candidates ?? []) {
    const { hard, fuzzy } = matchAgainstExclusionIndex(candidate, index);
    if (hard) {
      rejected.push({
        candidate,
        reason: DISCOVERY_REJECT_REASON.duplicate,
        matched: {
          title: hard.entry.title,
          year: hard.entry.year,
          source: hard.entry.source,
          kind: hard.kind,
        },
      });
      continue;
    }

    if (fuzzy) {
      accepted.push({
        ...candidate,
        fuzzy_needs_review: {
          kind: fuzzy.kind,
          similarity: fuzzy.similarity,
          matched: {
            title: fuzzy.entry.title,
            year: fuzzy.entry.year,
            source: fuzzy.entry.source,
          },
        },
      });
      continue;
    }

    accepted.push(candidate);
  }

  return { accepted, rejected };
}

/**
 * Build matched_record for eligibility FAIL duplicate.
 * @param {{ kind: string, entry: object }} hard
 */
export function buildMatchedRecord(hard) {
  return {
    title: hard.entry.title,
    year: hard.entry.year,
    source: hard.entry.source,
    kind: hard.kind,
    original_title: hard.entry.original_title ?? null,
  };
}

export { DISCOVERY_SOURCE };
