/**
 * Weekly film discovery orchestration (Manager → Researcher → Eligibility → email).
 * Persist and email adapters are injectable for dry-run / tests.
 */

import {
  DISCOVERY_BATCH_STATUS,
  DISCOVERY_DEFAULTS,
  DISCOVERY_ELIGIBILITY,
  DISCOVERY_MAX_RESEARCH_ROUNDS,
  DISCOVERY_REJECT_REASON,
  DISCOVERY_REVIEW_STATUS,
  DISCOVERY_SOURCE,
  DISCOVERY_TARGET_CANDIDATE_COUNT,
  discoveryWeekKey,
  isPermanentRejectReason,
} from "./film-discovery.mjs";
import { buildManagerBriefFromAnalytics } from "./film-discovery-manager.mjs";
import {
  allowIncompleteBatch,
  buildEligibilityPrompt,
  buildResearcherPrompt,
  mergeEligibilityReviews,
  normalizeResearcherCandidate,
  remainingCandidatesNeeded,
  reviewCandidateEligibility,
} from "./film-discovery-eligibility.mjs";
import {
  buildExclusionEntriesFromCandidates,
  buildExclusionEntriesFromFilms,
  buildExclusionEntriesFromWorkflowRound,
  filterResearcherCandidatesAgainstIndex,
  formatExclusionIndexForResearcher,
  mergeExclusionIndexes,
} from "./film-discovery-exclusion.mjs";
import { formatWeeklyFilmDiscoveryEmail } from "./film-discovery-email.mjs";
import { verifyCandidateExistsOnTmdb } from "./film-discovery-source-verify.mjs";
import { enrichDiscoveryImportRowsWithReviewSignals } from "./film-discovery-import-review-signals.mjs";

/**
 * @param {string} content
 * @returns {unknown}
 */
export function parseJsonFromModelText(content) {
  const trimmed = String(content ?? "").trim();
  if (!trimmed) throw new Error("Empty model response");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through to candidate salvage
      }
    }
    const salvaged = salvageCandidatesJson(trimmed);
    if (salvaged) return salvaged;
    throw new Error("Model response is not valid JSON");
  }
}

/**
 * Best-effort: pull individual candidate objects when the full JSON is broken.
 * @param {string} text
 * @returns {{ candidates: object[] } | null}
 */
export function salvageCandidatesJson(text) {
  const blob = String(text ?? "");
  const marker = blob.indexOf('"candidates"');
  if (marker < 0) return null;
  const arrayStart = blob.indexOf("[", marker);
  if (arrayStart < 0) return null;

  /** @type {object[]} */
  const candidates = [];
  let i = arrayStart + 1;
  while (i < blob.length && candidates.length < 30) {
    const objStart = blob.indexOf("{", i);
    if (objStart < 0) break;
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;
    for (let j = objStart; j < blob.length; j += 1) {
      const ch = blob[j];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end < 0) break;
    const slice = blob.slice(objStart, end + 1);
    try {
      const obj = JSON.parse(slice);
      if (obj && typeof obj === "object" && obj.title) candidates.push(obj);
    } catch {
      // skip broken object
    }
    i = end + 1;
  }

  return candidates.length ? { candidates } : null;
}

/**
 * Resolve discovery model from request / env / defaults.
 * @param {string | undefined} explicit
 */
export function resolveDiscoveryModel(explicit) {
  return (
    explicit ||
    process.env.WEEKLY_FILM_DISCOVERY_MODEL ||
    DISCOVERY_DEFAULTS.model
  );
}

/**
 * @param {boolean | undefined} explicit
 */
export function resolveDiscoveryWebSearch(explicit) {
  if (explicit === true || explicit === false) return explicit;
  if (process.env.WEEKLY_FILM_DISCOVERY_WEB_SEARCH === "0") return false;
  if (process.env.WEEKLY_FILM_DISCOVERY_WEB_SEARCH === "1") return true;
  return DISCOVERY_DEFAULTS.webSearch;
}

/**
 * Plain chat JSON call (Eligibility, no browsing).
 * @param {object} openai
 * @param {{ model?: string, system: string, user: string }} request
 */
export async function callDiscoveryChat(openai, request) {
  const response = await openai.chat.completions.create({
    model:
      request.model ||
      process.env.WEEKLY_FILM_DISCOVERY_ELIGIBILITY_MODEL ||
      DISCOVERY_DEFAULTS.eligibilityModel,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
  });
  const content = response.choices?.[0]?.message?.content;
  return parseJsonFromModelText(content);
}

/**
 * Researcher call: stronger model + optional OpenAI web search.
 * Web search cannot use JSON mode, so we parse JSON from free text.
 *
 * @param {object} openai
 * @param {{
 *   model?: string,
 *   system: string,
 *   user: string,
 *   webSearch?: boolean,
 * }} request
 */
export async function callDiscoveryResearcher(openai, request) {
  const model = resolveDiscoveryModel(request.model);
  const webSearch = resolveDiscoveryWebSearch(request.webSearch);

  if (!webSearch || typeof openai?.responses?.create !== "function") {
    return callDiscoveryChat(openai, {
      model,
      system: request.system,
      user: request.user,
    });
  }

  const response = await openai.responses.create({
    model,
    temperature: 0.2,
    tools: [{ type: "web_search_preview" }],
    tool_choice: "auto",
    input: [
      {
        role: "developer",
        content: `${request.system}

You may use web search to find and verify titles, years, countries, and source URLs.
Keep searching until you can fill the requested candidate count with real films.
Return ONLY a single JSON object (no markdown fences, no commentary) matching the schema in the user prompt.
Never invent films or URLs. Prefer a full list of confirmed titles over a short partial list.`,
      },
      {
        role: "user",
        content: request.user,
      },
    ],
  });

  const content =
    typeof response.output_text === "string" ? response.output_text : "";
  if (!content.trim()) {
    throw new Error("Empty Researcher web-search response");
  }

  try {
    return parseJsonFromModelText(content);
  } catch (parseError) {
    // Web-search replies are often almost-JSON; ask a cheap JSON pass to repair.
    console.error(
      "Researcher web-search JSON parse failed; repairing via chat JSON mode:",
      parseError instanceof Error ? parseError.message : parseError
    );
    return callDiscoveryChat(openai, {
      model:
        process.env.WEEKLY_FILM_DISCOVERY_ELIGIBILITY_MODEL ||
        DISCOVERY_DEFAULTS.eligibilityModel,
      system:
        "Repair the film discovery JSON. Return ONLY valid JSON {\"candidates\":[...]}. Keep EVERY candidate that has at least title + year. Fix quotes/trailing commas/markdown. Do not add new films. Do not drop real titles just because evidence is messy.",
      user: content.slice(0, 24000),
    });
  }
}

/**
 * Summarize FAIL reasons for the email.
 * @param {Array<{ title: string, review: import("./film-discovery.mjs").EligibilityReview }>} failed
 */
export function summarizeRejectionReasons(failed) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const item of failed) {
    for (const reason of item.review.reasons) {
      const key = reason.replace(/:.*/, (match) => match.slice(0, 48));
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([reason, count]) => ({ reason, count }));
}

/**
 * Staging rows relevant to weekly discovery exclusion (not Manager).
 * @param {Array<{ review_status?: string, reject_reason?: string | null }>} rows
 */
export function filterAlreadyReviewedCandidates(rows) {
  return (rows ?? []).filter((row) =>
    [
      DISCOVERY_REVIEW_STATUS.pendingReview,
      DISCOVERY_REVIEW_STATUS.approved,
      DISCOVERY_REVIEW_STATUS.rejected,
    ].includes(row.review_status)
  );
}

/**
 * Build the round exclusion index for Researcher + Eligibility.
 *
 * @param {{
 *   catalogFilms: object[],
 *   existingCandidates: object[],
 *   passed: Array<{ candidate: object, review: object }>,
 *   failed: Array<{ candidate: object, review: object }>,
 * }} input
 */
export function buildRoundExclusionIndex(input) {
  const permanentFails = (input.failed ?? []).filter((item) => {
    const code = item.review?.reason_code;
    if (code === DISCOVERY_REJECT_REASON.duplicate) return true;
    if (code && isPermanentRejectReason(code)) return true;
    // Identity-level fails should not be re-proposed this run
    return Boolean(item.review?.matched_record);
  });

  return mergeExclusionIndexes(
    buildExclusionEntriesFromFilms(input.catalogFilms ?? []),
    buildExclusionEntriesFromCandidates(input.existingCandidates ?? []),
    buildExclusionEntriesFromWorkflowRound(input.passed ?? []),
    buildExclusionEntriesFromWorkflowRound(permanentFails)
  );
}

/**
 * Approve must not publish or enrich.
 * @param {{ review_status: string }} candidate
 */
export function buildApproveCandidatePatch(candidate) {
  if (candidate.review_status !== DISCOVERY_REVIEW_STATUS.pendingReview) {
    throw new Error(
      `Only pending_review candidates can be approved (got ${candidate.review_status})`
    );
  }
  return {
    review_status: DISCOVERY_REVIEW_STATUS.approved,
    reject_reason: null,
    reviewed_at: new Date().toISOString(),
    publish: false,
    enrich: false,
    insert_into_films: false,
    catalog_visible: false,
  };
}

/**
 * @param {{ review_status: string }} candidate
 * @param {string | null | undefined} reason
 */
export function buildRejectCandidatePatch(candidate, reason) {
  if (candidate.review_status !== DISCOVERY_REVIEW_STATUS.pendingReview) {
    throw new Error(
      `Only pending_review candidates can be rejected (got ${candidate.review_status})`
    );
  }
  const trimmed =
    typeof reason === "string" && reason.trim() ? reason.trim() : null;
  return {
    review_status: DISCOVERY_REVIEW_STATUS.rejected,
    reject_reason: trimmed,
    reviewed_at: new Date().toISOString(),
  };
}

/**
 * @param {object | null | undefined} _candidate
 */
export function isDiscoveryCandidatePublic(_candidate) {
  return false;
}

/**
 * @param {object} options
 * @param {object[]} options.catalogFilms
 * @param {object[]} [options.existingCandidates]
 * @param {(prompt: string, context?: { exclusionIndex: object[], compactExclusion: object[], round: number }) => Promise<unknown>} [options.researcherFn]
 * @param {(prompt: string, candidate: object) => Promise<import("./film-discovery.mjs").EligibilityReview | null>} [options.eligibilityLlmFn]
 * @param {(candidate: object) => Promise<object | null>} [options.mediaCuratorFn]
 * @param {(batch: object, candidates: object[]) => Promise<unknown>} [options.persistFn]
 * @param {(report: object) => Promise<unknown>} [options.sendEmailFn]
 * @param {boolean} [options.dryRun]
 * @param {boolean} [options.skipEmail]
 * @param {number} [options.targetCount]
 * @param {number} [options.maxRounds]
 * @param {Date | string} [options.now]
 * @param {import("./film-discovery.mjs").ManagerBrief} [options.briefOverride]
 * @param {"full" | "summary"} [options.exclusionListMode]
 * @param {string} [options.tmdbApiKey] — when set, PASS candidates must match TMDB identity
 */
export async function runWeeklyFilmDiscovery(options) {
  const targetCount = options.targetCount ?? DISCOVERY_TARGET_CANDIDATE_COUNT;
  const maxRounds = options.maxRounds ?? DISCOVERY_MAX_RESEARCH_ROUNDS;
  const exclusionListMode =
    options.exclusionListMode === "full" ? "full" : "summary";
  const weekKey = discoveryWeekKey(options.now ?? new Date());
  const catalogFilms = options.catalogFilms ?? [];
  const existingCandidates = filterAlreadyReviewedCandidates(
    options.existingCandidates ?? []
  );

  // Manager: analytics brief only — no film-level dedupe.
  const brief =
    options.briefOverride ?? buildManagerBriefFromAnalytics(catalogFilms);

  /** @type {Array<{ candidate: import("./film-discovery.mjs").ResearcherCandidate, review: import("./film-discovery.mjs").EligibilityReview }>} */
  const passed = [];
  /** @type {Array<{ candidate: import("./film-discovery.mjs").ResearcherCandidate, review: import("./film-discovery.mjs").EligibilityReview }>} */
  const failed = [];
  /** @type {string[]} */
  const unmetNotes = [];

  let round = 0;
  /** @type {object[]} */
  let lastExclusionIndex = [];

  while (round < maxRounds) {
    round += 1;
    const needed = remainingCandidatesNeeded(passed.length, targetCount);
    if (needed === 0) break;

    // Web-search replies break more often on large JSON — ask in small batches.
    const webBatch = DISCOVERY_DEFAULTS.researcherWebBatchSize ?? 5;
    const askFor = resolveDiscoveryWebSearch(options.webSearch)
      ? Math.min(needed, webBatch)
      : needed;

    const exclusionIndex = buildRoundExclusionIndex({
      catalogFilms,
      existingCandidates,
      passed,
      failed,
    });
    lastExclusionIndex = exclusionIndex;
    const compactExclusion = formatExclusionIndexForResearcher(exclusionIndex);

    if (!options.researcherFn) {
      throw new Error("researcherFn is required to propose candidates");
    }

    const prompt = buildResearcherPrompt({
      brief,
      exclusionIndex,
      compactExclusion,
      alreadyPassed: passed.map((item) => item.candidate),
      needed: askFor,
      round,
      exclusionListMode,
      rejectedThisRun: failed.slice(-20).map((item) => ({
        title: item.candidate.title,
        year: item.candidate.year,
        reason: item.review?.reason_code ?? item.review?.reasons?.[0] ?? "rejected",
      })),
    });

    const raw = await options.researcherFn(prompt, {
      exclusionIndex,
      compactExclusion,
      round,
    });
    const list = Array.isArray(raw?.candidates)
      ? raw.candidates
      : Array.isArray(raw)
        ? raw
        : [];

    const normalized = list
      .map((item) => normalizeResearcherCandidate(item))
      .filter(Boolean);

    // Programmatic Researcher dedupe against full index (not LLM-only).
    const { accepted, rejected: researcherDupes } =
      filterResearcherCandidatesAgainstIndex(normalized, exclusionIndex);

    for (const dup of researcherDupes) {
      failed.push({
        candidate: dup.candidate,
        review: {
          result: DISCOVERY_ELIGIBILITY.fail,
          reasons: [DISCOVERY_REJECT_REASON.duplicate, `Researcher pre-filter: ${dup.matched.kind}`],
          missing: [],
          fix_hints: ["Do not re-propose known titles"],
          reason_code: DISCOVERY_REJECT_REASON.duplicate,
          matched_record: {
            title: dup.matched.title,
            year: dup.matched.year,
            source: dup.matched.source,
            kind: dup.matched.kind,
          },
          evidence: { stage: "researcher_prefilter" },
        },
      });
    }

    if (accepted.length === 0) {
      unmetNotes.push(
        `Round ${round}: Researcher returned no usable new candidates after exclusion filter`
      );
      if (
        allowIncompleteBatch({
          round,
          passedCount: passed.length,
          targetCount,
          maxRounds,
        })
      ) {
        break;
      }
      continue;
    }

    for (const candidate of accepted) {
      if (passed.length >= targetCount) break;

      if (
        passed.some(
          (item) =>
            item.candidate.title === candidate.title &&
            item.candidate.year === candidate.year
        )
      ) {
        continue;
      }

      // Eligibility independently re-checks duplicates against the live index
      // plus other candidates already accepted this round.
      const liveIndex = mergeExclusionIndexes(
        exclusionIndex,
        buildExclusionEntriesFromWorkflowRound(
          passed.map((item) => item.candidate)
        )
      );

      let deterministic = reviewCandidateEligibility(candidate, {
        exclusionIndex: liveIndex,
      });

      if (
        deterministic.result === DISCOVERY_ELIGIBILITY.pass &&
        options.tmdbApiKey
      ) {
        try {
          const tmdbCheck = await verifyCandidateExistsOnTmdb(candidate, {
            tmdbApiKey: options.tmdbApiKey,
          });
          if (!tmdbCheck.skipped && !tmdbCheck.ok) {
            deterministic = {
              ...deterministic,
              result: DISCOVERY_ELIGIBILITY.fail,
              reasons: [
                ...deterministic.reasons,
                "No TMDB identity match — likely invented or misidentified title",
              ],
              missing: [...deterministic.missing, "tmdb_identity"],
              fix_hints: [
                ...deterministic.fix_hints,
                "Propose a real film that appears on TMDB with matching title/year",
              ],
              reason_code: DISCOVERY_REJECT_REASON.insufficientSources,
              evidence: {
                ...deterministic.evidence,
                tmdb_verify: tmdbCheck,
              },
            };
          } else if (tmdbCheck.ok) {
            deterministic = {
              ...deterministic,
              evidence: {
                ...deterministic.evidence,
                tmdb_verify: tmdbCheck,
              },
            };
          }
        } catch (tmdbError) {
          console.error(
            `TMDB verify failed for ${candidate.title}:`,
            tmdbError instanceof Error ? tmdbError.message : tmdbError
          );
        }
      }

      let llmReview = null;
      if (
        deterministic.result === DISCOVERY_ELIGIBILITY.pass &&
        options.eligibilityLlmFn
      ) {
        llmReview = await options.eligibilityLlmFn(
          buildEligibilityPrompt({ brief, candidate }),
          candidate
        );
      }

      const review = mergeEligibilityReviews(deterministic, llmReview);
      if (review.result === DISCOVERY_ELIGIBILITY.pass) {
        let media = null;
        if (options.mediaCuratorFn) {
          media = await options.mediaCuratorFn({
            ...candidate,
            eligibility_result: DISCOVERY_ELIGIBILITY.pass,
          });
        }
        let content = null;
        if (options.contentCuratorFn) {
          content = await options.contentCuratorFn({
            ...candidate,
            eligibility_result: DISCOVERY_ELIGIBILITY.pass,
            media_status: media?.media_status ?? null,
          });
        }
        passed.push({ candidate, review, media, content });
      } else {
        failed.push({ candidate, review });
      }
    }

    if (passed.length >= targetCount) break;
    if (
      allowIncompleteBatch({
        round,
        passedCount: passed.length,
        targetCount,
        maxRounds,
      })
    ) {
      break;
    }
  }

  const incomplete = passed.length < targetCount;
  if (incomplete) {
    unmetNotes.push(
      `Confirmed ${passed.length}/${targetCount} after ${round} research round(s). Did not invent or force-pass doubtful films.`
    );
    const topFails = failed.slice(-Math.max(0, targetCount - passed.length));
    for (const item of topFails) {
      unmetNotes.push(
        `Unfilled slot — rejected "${item.candidate.title}" (${item.candidate.year}): ${item.review.reasons.join("; ")}`
      );
    }
  }

  const batchStatus = incomplete
    ? DISCOVERY_BATCH_STATUS.completedIncomplete
    : DISCOVERY_BATCH_STATUS.completed;

  const batch = {
    week_key: weekKey,
    status: batchStatus,
    manager_brief: brief,
    research_rounds: round,
    passed_count: passed.length,
    failed_count: failed.length,
    incomplete,
    incomplete_notes: unmetNotes.join("\n") || null,
    rejection_summary: summarizeRejectionReasons(failed),
  };

  const candidateRowsRaw = passed.map(({ candidate, review, media, content }) => ({
    source: DISCOVERY_SOURCE.weeklyDiscovery,
    title: candidate.title,
    original_title: candidate.original_title,
    year: candidate.year,
    directors: candidate.directors,
    countries: candidate.countries,
    runtime_minutes: candidate.runtime_minutes,
    source_urls: candidate.source_urls,
    manager_why: candidate.manager_why,
    researcher_why: candidate.researcher_why,
    eligibility_evidence: candidate.requirement_evidence,
    eligibility_result: review.result,
    eligibility_reasons: review.reasons,
    eligibility_missing: review.missing,
    eligibility_fix_hints: review.fix_hints,
    review_status: DISCOVERY_REVIEW_STATUS.pendingReview,
    poster_url: media?.poster_url ?? null,
    poster_source_url: media?.poster_source_url ?? null,
    poster_source_label: media?.poster_source_label ?? null,
    trailer_url: media?.trailer_url ?? null,
    trailer_provider: media?.trailer_provider ?? null,
    trailer_video_id: media?.trailer_video_id ?? null,
    trailer_source: media?.trailer_source ?? null,
    trailer_source_label: media?.trailer_source_label ?? null,
    media_status: media?.media_status ?? "media_pending",
    media_notes: media?.media_notes ?? null,
    media_attempts: media?.media_attempts ?? 0,
    media_updated_at: media?.media_updated_at ?? null,
    synopsis: content?.synopsis ?? null,
    the_mood: content?.the_mood ?? null,
    technique: content?.technique ?? null,
    moods: content?.moods ?? null,
    content_status: content?.content_status ?? "pending",
    content_note: content?.content_note ?? null,
    content_revision_count: content?.content_revision_count ?? 0,
    content_updated_at: content?.content_updated_at ?? null,
  }));

  // Kids + near-dupe suspicion on every weekly persist (same as manual seed import).
  const enrichedCandidates = await enrichDiscoveryImportRowsWithReviewSignals(
    candidateRowsRaw,
    {
      catalogFilms,
      tmdbApiKey: options.tmdbApiKey ?? null,
    }
  );
  const candidateRows = enrichedCandidates.rows;

  const report = {
    batch,
    passed: candidateRows,
    failed: failed.map(({ candidate, review }) => ({
      title: candidate.title,
      year: candidate.year,
      reasons: review.reasons,
      missing: review.missing,
      fix_hints: review.fix_hints,
      reason_code: review.reason_code ?? null,
      matched_record: review.matched_record ?? null,
    })),
    exclusion_index_size: lastExclusionIndex.length,
    email: formatWeeklyFilmDiscoveryEmail({
      brief,
      researchRounds: round,
      passed: candidateRows,
      failed,
      incomplete,
      incompleteNotes: unmetNotes,
      rejectionSummary: batch.rejection_summary,
    }),
    dryRun: Boolean(options.dryRun),
  };

  if (!options.dryRun && options.persistFn) {
    await options.persistFn(batch, candidateRows);
  }

  if (!options.dryRun && !options.skipEmail && options.sendEmailFn) {
    await options.sendEmailFn(report);
  }

  return report;
}
