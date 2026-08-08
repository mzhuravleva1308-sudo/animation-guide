/**
 * Content curator + Content reviewer for weekly film discovery staging.
 *
 * Produces films-compatible fields: synopsis, the_mood, technique, moods.
 * Max pipeline: 1 generation → 1 review → at most 1 revision.
 * Never writes public.films, never publishes, never changes review_status/media_status.
 */

import {
  cleanupEditorialField,
  countWords,
  findBannedPhrases,
  findBannedWhatItIsPhrases,
  findMoodRestraintIssues,
  validateMoodOnly,
} from "./film-editorial-copy.mjs";
import {
  DISCOVERY_CONTENT_STATUS,
  DISCOVERY_CONTENT_VERDICT,
  DISCOVERY_ELIGIBILITY,
} from "./film-discovery.mjs";
import {
  CATALOG_MOOD_TAG_VOCABULARY,
  CONTENT_LENGTH,
  CONTENT_STYLE_GUIDE_VERSION,
  formatContentStyleGuideForPrompt,
  getContentStyleGuide,
} from "./film-discovery-content-style-guide.mjs";
import { applyBatchEditorialAudit } from "./film-discovery-content-batch-audit.mjs";
import { composeContentNote } from "./film-discovery-content-note.mjs";
import { gatherTechniqueResearch, createWikipediaResearchState } from "./film-discovery-content-research.mjs";
import {
  normalizeDiscoveryTechniqueLabels,
  preferEvidenceBackedTechniqueLabels,
  resolveTechniqueStatusPolicy,
} from "./film-discovery-technique.mjs";
import { findTmdbMatchForCandidate } from "./film-discovery-media.mjs";
import { parseJsonFromModelText } from "./film-discovery-workflow.mjs";
import {
  formatMoodWritingGuideForPrompt,
  loadMoodWritingGuide,
  MOOD_GUIDE_ID,
  selectRelevantMoodExamples,
} from "./film-mood-writing-guide.mjs";
import {
  flagMoodPatterns,
  rewriteMoodForFilm,
} from "./film-mood-only-rewrite.mjs";
import { runMoodEditorPass } from "./film-mood-editor.mjs";

const CATALOG_MOOD_SET = new Set(
  CATALOG_MOOD_TAG_VOCABULARY.map((tag) => tag.toLowerCase())
);

const WEAK_MOOD_OPENING_RE =
  /^(fast-paced and|dark and|quiet and|tense and)\b/i;

export const CONTENT_CURATOR_ROLE = "Content curator";
export const CONTENT_REVIEWER_ROLE = "Content reviewer";

/**
 * Content runs after Eligibility PASS. Media should exist but partial is allowed.
 * @param {{ eligibility_result?: string | null, media_status?: string | null }} row
 */
export function shouldRunContentCurator(row) {
  return row?.eligibility_result === DISCOVERY_ELIGIBILITY.pass;
}

/**
 * @param {{ content_status?: string | null }} row
 * @param {{ force?: boolean }} [options]
 */
export function shouldAttemptContentLookup(row, { force = false } = {}) {
  if (force) return true;
  return ![
    DISCOVERY_CONTENT_STATUS.ready,
    DISCOVERY_CONTENT_STATUS.readyWithNote,
  ].includes(row?.content_status);
}

/**
 * Resume: pending / failed (not ready unless force).
 * @param {{ content_status?: string | null }} row
 * @param {{ force?: boolean }} [options]
 */
export function isContentResumeEligible(row, { force = false } = {}) {
  if (force) return true;
  const status = row?.content_status ?? DISCOVERY_CONTENT_STATUS.pending;
  return [
    DISCOVERY_CONTENT_STATUS.pending,
    DISCOVERY_CONTENT_STATUS.failed,
  ].includes(status);
}

/**
 * Dry-run / log-only acceptance label (not a DB column).
 * @param {{ revisionCount?: number, verdict?: string | null, status?: string, hasNotes?: boolean }} input
 */
export function resolveContentAcceptance(input) {
  if (input.status === DISCOVERY_CONTENT_STATUS.failed) {
    return "failed";
  }
  if ((input.revisionCount ?? 0) >= 1) {
    return "revised_once";
  }
  if (input.verdict === DISCOVERY_CONTENT_VERDICT.passWithNote || input.hasNotes) {
    return "pass_with_notes";
  }
  if (input.verdict === DISCOVERY_CONTENT_VERDICT.pass) {
    return "accepted_first_pass";
  }
  if (input.verdict === DISCOVERY_CONTENT_VERDICT.fix) {
    return "fixed_once";
  }
  return "pending";
}

/**
 * Permanent staging patch only — no reviewer/research diagnostics columns.
 * @param {object} contentResult
 */
export function buildContentCandidatePatch(contentResult) {
  return {
    synopsis: contentResult.synopsis ?? null,
    the_mood: contentResult.the_mood ?? null,
    technique: contentResult.technique ?? null,
    moods: contentResult.moods ?? null,
    content_status: contentResult.content_status,
    content_note: contentResult.content_note ?? null,
    content_revision_count: contentResult.content_revision_count ?? 0,
    content_updated_at: new Date().toISOString(),
    writes_to_films_table: false,
    publish: false,
    enrich_full: false,
    review_status_unchanged: true,
    media_status_unchanged: true,
    identity_fields_unchanged: true,
    email_sent: false,
  };
}

/**
 * Rough token overlap vs TMDB overview (curatorial value heuristic).
 * @param {string} synopsis
 * @param {string | null | undefined} overview
 */
export function measureSynopsisOverviewOverlap(synopsis, overview) {
  const a = new Set(
    String(synopsis ?? "")
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3)
  );
  const b = new Set(
    String(overview ?? "")
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3)
  );
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const word of a) {
    if (b.has(word)) hit += 1;
  }
  return hit / a.size;
}

/**
 * Local deterministic checks before/after LLM.
 * @param {{ synopsis?: string, the_mood?: string, technique?: string | string[], moods?: string[] }} draft
 * @param {{ confirmedNewLabels?: string[], tmdbOverview?: string | null, techniqueEvidence?: object[], wikipediaOnlyDistinctive?: object[] }} [options]
 */
export function validateDiscoveryContentDraft(draft, options = {}) {
  const synopsis = cleanupEditorialField(draft.synopsis);
  const theMood = cleanupEditorialField(draft.the_mood);
  /** @type {string[]} */
  const issues = [];

  if (!synopsis) issues.push("synopsis is empty");
  if (!theMood) issues.push("the_mood is empty");

  const synWords = countWords(synopsis);
  if (synWords > 0 && synWords < CONTENT_LENGTH.synopsisMinWords) {
    issues.push(`synopsis too short (${synWords} words)`);
  }
  if (synWords > CONTENT_LENGTH.synopsisHardMaxWords) {
    issues.push(`synopsis exceeds ${CONTENT_LENGTH.synopsisHardMaxWords} words`);
  }

  for (const phrase of findBannedPhrases(synopsis)) {
    issues.push(`synopsis banned phrasing: ${phrase}`);
  }
  for (const phrase of findBannedWhatItIsPhrases(synopsis)) {
    issues.push(`synopsis trailer phrasing: ${phrase}`);
  }

  const moodValidation = validateMoodOnly(theMood, synopsis);
  issues.push(...moodValidation.issues);
  issues.push(...findMoodRestraintIssues(theMood));

  /** @type {string[]} */
  const softNotes = [];

  if (WEAK_MOOD_OPENING_RE.test(theMood)) {
    softNotes.push(
      "the_mood uses a common 'X and …' opening — usable, but consider variety"
    );
  }
  if (/\b(quirky|dreamlike|reflective)\b/i.test(theMood)) {
    softNotes.push(
      "the_mood uses a generic adjective (quirky/dreamlike/reflective) without much specificity"
    );
  }
  if (
    /\b(with a steady rhythm|with a tense atmosphere|underscored by|marked by|a blend of)\b/i.test(
      theMood
    )
  ) {
    softNotes.push("the_mood uses a stock connective phrase");
  }

  const overlap = measureSynopsisOverviewOverlap(synopsis, options.tmdbOverview);
  const lowCuratorialValue = Boolean(options.tmdbOverview) && overlap >= 0.85;
  if (lowCuratorialValue) {
    softNotes.push("synopsis is close to the TMDB overview (still usable if clear)");
  }

  let moods = Array.isArray(draft.moods)
    ? draft.moods.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
    : [];
  if (moods.length && (moods.length < 4 || moods.length > 7)) {
    softNotes.push(`moods should ideally have 4–7 tags (got ${moods.length})`);
  }
  const unknownMoodTags = moods.filter((tag) => !CATALOG_MOOD_SET.has(tag));
  if (unknownMoodTags.length >= 3) {
    softNotes.push(
      `moods include off-vocabulary tags: ${unknownMoodTags.slice(0, 5).join(", ")}`
    );
  }

  const tech = normalizeDiscoveryTechniqueLabels(draft.technique, {
    confirmedNewLabels: options.confirmedNewLabels,
  });

  const evidence = options.techniqueEvidence ?? [];
  /** @type {string[]} */
  let labels = [];
  if (evidence.length) {
    labels = preferEvidenceBackedTechniqueLabels(tech.labels, evidence);
  }
  // Never keep curator guesses when research did not cite a production method.

  const techPolicy = resolveTechniqueStatusPolicy({
    labels,
    diagnostics: tech.diagnostics,
    nonBlockingUnknown: tech.nonBlockingUnknown,
    blockingUnknown: tech.blockingUnknown,
    unknown: tech.unknown,
    techniqueEvidence: evidence,
    wikipediaOnlyDistinctive: options.wikipediaOnlyDistinctive ?? [],
  });

  if (!labels.length) {
    softNotes.push("technique missing after normalization");
  }

  const sharedLongWords = synopsis
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length >= 7)
    .filter((word) => theMood.toLowerCase().includes(word));
  if (sharedLongWords.length >= 2) {
    issues.push("synopsis and the_mood repeat descriptive language");
  }

  const hardIssues = issues.filter(
    (issue) =>
      !/stock|generic filler|CURATORIAL|near-paraphrase|moods should|off-vocabulary|technique missing/i.test(
        issue
      )
  );

  return {
    ok: hardIssues.length === 0 && Boolean(synopsis) && Boolean(theMood),
    issues: hardIssues,
    softNotes: [...softNotes, ...(techPolicy.techniqueNotes ?? [])],
    synopsis,
    the_mood: moodValidation.the_mood || theMood,
    technique: labels.length ? labels.join(", ") : null,
    techniqueLabels: labels,
    unknownTechniques: tech.unknown,
    nonBlockingTechniqueNotes: techPolicy.nonBlockingNotes,
    blockingTechniqueUnknown: [],
    techniqueDiagnostics: tech.diagnostics,
    techniqueSynonymHits: tech.synonymHits,
    confirmedNewTechniques: tech.confirmedNewAccepted,
    techniqueNeedsReview: false,
    techniqueBlockingReasons: [],
    techniqueNotes: techPolicy.techniqueNotes ?? [],
    techniqueProvenance: techPolicy.techniqueProvenance,
    techniqueLabelsWithDirectEvidence: techPolicy.techniqueLabelsWithDirectEvidence,
    techniqueLabelsInferredOnly: techPolicy.techniqueLabelsInferredOnly,
    lowCuratorialValue,
    synopsisOverviewOverlap: overlap,
    moods,
    writerCopyNotes: draft.copy_notes ?? null,
    writerTechniqueNotes: draft.technique_notes ?? null,
  };
}

export async function gatherContentFactPack(candidate, options = {}) {
  const identity = {
    title: candidate.title,
    original_title: candidate.original_title ?? null,
    year: candidate.year ?? null,
    director: Array.isArray(candidate.directors)
      ? candidate.directors.join(", ")
      : null,
    directors: candidate.directors ?? [],
    country: Array.isArray(candidate.countries)
      ? candidate.countries.join(", ")
      : null,
  };

  /** @type {string[]} */
  const sources = [];
  let tmdbOverview = null;
  let tmdbGenreNames = [];
  let tmdbMatch = null;

  if (options.tmdbApiKey) {
    try {
      const resolved = await findTmdbMatchForCandidate(identity, {
        tmdbApiKey: options.tmdbApiKey,
        fetchImpl: options.fetchImpl,
      });
      tmdbMatch = resolved.match;
      if (resolved.match?.overview) {
        tmdbOverview = String(resolved.match.overview).trim();
        sources.push("TMDB overview");
      }
      if (Array.isArray(resolved.match?.genres)) {
        tmdbGenreNames = resolved.match.genres
          .map((genre) => genre.name)
          .filter(Boolean);
      }
      if (resolved.match?.id) {
        sources.push(`TMDB movie id ${resolved.match.id}`);
      }
    } catch {
      sources.push("TMDB lookup failed");
    }
  }

  sources.push("candidate identity fields");
  if (Array.isArray(candidate.source_urls)) {
    sources.push(...candidate.source_urls.slice(0, 5));
  }

  const research = await gatherTechniqueResearch(candidate, {
    tmdbOverview,
    tmdbMovieId: tmdbMatch?.id ?? null,
    tmdbApiKey: options.tmdbApiKey ?? null,
    fetchImpl: options.fetchImpl,
    enableWikipedia: options.enableWikipedia,
    enableSourceFetch: options.enableSourceFetch,
    enableWebSearch: options.enableWebSearch,
    enableAiTechnique: options.enableAiTechnique,
    aiTechniqueFn: options.aiTechniqueFn,
    openai: options.openai,
    delayMs: options.researchDelayMs,
    wikipediaState: options.wikipediaState,
    webSearchState: options.webSearchState,
  });

  sources.push(...research.researchSources);

  return {
    identity,
    tmdbOverview,
    tmdbGenreNames,
    tmdbMatchId: tmdbMatch?.id ?? null,
    runtime_minutes: candidate.runtime_minutes ?? tmdbMatch?.runtime ?? null,
    sources,
    styleGuideVersion: CONTENT_STYLE_GUIDE_VERSION,
    techniqueEvidence: research.techniqueEvidence,
    // Identity-verified wiki metadata only — never full extract for creative copy.
    wikipedia: research.wikipedia,
    researchSources: research.researchSources,
    researchNotes: research.researchNotes,
    officialSources: research.officialSources,
    editorialOrProductionSources: research.editorialOrProductionSources,
    tmdbSources: research.tmdbSources,
    wikipediaSources: research.wikipediaSources,
    rejectedOrAmbiguousSources: research.rejectedOrAmbiguousSources,
    descriptionsBasedOnlyOnTmdbOverview:
      research.descriptionsBasedOnlyOnTmdbOverview,
    descriptionsUsingWikipediaContext: false,
    hasDirectTechniqueEvidence: research.hasDirectTechniqueEvidence,
    hasStrongTechniqueEvidence: research.hasStrongTechniqueEvidence,
    usedWikipediaFallback: research.usedWikipediaFallback,
    usedWebSearch: research.usedWebSearch,
    usedAiTechnique: research.usedAiTechnique,
    webSearchUrls: research.webSearchUrls,
    wikipediaOnlyDistinctive: research.wikipediaOnlyDistinctive,
    officialSourceFetches: research.officialSourceFetches,
    wikipediaMetrics: research.wikipediaMetrics,
    webSearchMetrics: research.webSearchMetrics,
    researchCompleted: true,
  };
}

/**
 * @param {object} candidate
 * @param {object} factPack
 * @param {string} [repairNote]
 * @param {{ moodGuide?: object | null, overusedMoodConstructions?: string[] }} [promptOptions]
 */
export function buildContentCuratorPrompt(
  candidate,
  factPack,
  repairNote = "",
  promptOptions = {}
) {
  const guide = getContentStyleGuide();
  const moodGuide = promptOptions.moodGuide ?? loadMoodWritingGuide();
  const moodGuideVersion = moodGuide?.version ?? MOOD_GUIDE_ID;
  const moodGuideBlock = formatMoodWritingGuideForPrompt(moodGuide);
  const relevantMoodExamples = selectRelevantMoodExamples(
    moodGuide,
    candidate.moods ?? [],
    4
  );
  const overused = promptOptions.overusedMoodConstructions ?? [];
  const repairSection = repairNote
    ? `\nTARGETED REVISION — change ONLY the fields named below; keep all other fields byte-for-byte:\n${repairNote}\n`
    : "";

  return `
You are the Resonale Content writer.
Write a usable catalog card draft for ONE animated feature.
Follow the Content Style Guide for synopsis/technique/moods.
For the_mood, the Mood Writing Guide is the primary style instruction.

${formatContentStyleGuideForPrompt(guide)}

MOOD WRITING GUIDE (${moodGuideVersion}):
${moodGuideBlock}

Relevant mood examples for this emotional profile (do not copy):
${relevantMoodExamples
  .map((ex) => `- "${ex.the_mood ?? ex.text ?? ""}"${ex.why ? ` — ${ex.why}` : ""}`)
  .join("\n") || "(none loaded)"}

Overused mood constructions in this batch — avoid repeating them:
${overused.length ? overused.map((x) => `- ${x}`).join("\n") : "(none yet)"}

Representative catalog-shaped examples (do not copy wording):
${guide.examples
  .slice(0, 3)
  .map(
    (ex) =>
      `- [${ex.kind}] technique: ${ex.technique}\n  synopsis: ${ex.synopsis}\n  the_mood: ${ex.the_mood}`
  )
  .join("\n")}

Film identity:
Title: ${candidate.title}
Original title: ${candidate.original_title ?? ""}
Year: ${candidate.year ?? ""}
Directors: ${(candidate.directors ?? []).join(", ")}
Countries: ${(candidate.countries ?? []).join(", ")}
Runtime minutes: ${factPack.runtime_minutes ?? candidate.runtime_minutes ?? ""}
Poster/trailer available: poster=${Boolean(candidate.poster_url || candidate.media_poster_url)} trailer=${Boolean(candidate.trailer_url || candidate.media_trailer_url)}

Materials:
TMDB overview (plot/identity seed — paraphrase; do not invent unsupported claims):
${factPack.tmdbOverview || "(none)"}
TMDB genres (not technique): ${(factPack.tmdbGenreNames ?? []).join(", ") || "(none)"}
Technique evidence / hints:
${JSON.stringify(factPack.techniqueEvidence ?? [], null, 2)}
Source URLs: ${(candidate.source_urls ?? []).join(" | ") || "(none)"}
Research notes: ${(factPack.researchNotes ?? []).join("; ") || "(none)"}
Researcher why: ${candidate.researcher_why ?? ""}
Manager why: ${candidate.manager_why ?? ""}
${repairSection}
Writing rules:
- Synopsis: central situation + one concrete distinctive fact if sources support it. Unusual premise/setting can be enough. No spoilers, no press-release tone, no fake "curatorial value".
- Avoid filler: "distinctive visual style", "powerful exploration", "notable for", "blending … with stylized animation" without a concrete fact.
- the_mood: follow the Mood Writing Guide. Viewing experience, not plot recap. Apply the specificity test. Technique mention optional.
- moods: 4–7 tags from catalog vocabulary; no technique/genre as mood. Tags and the_mood sentence complement each other.
- technique: max 2 production-method labels, and ONLY when Technique evidence / hints above supports them (matching label after normal synonyms). If evidence is empty or does not confirm a method, return technique: [] and explain in technique_notes. Do NOT invent "2D animation" (or any basic technique) just because the film is animated. Do NOT add a generic label beside a distinctive confirmed one (e.g. rotoscope alone, not "rotoscope, 2D animation").
- Never use adult/independent/surreal/musical/digital animation as technique.
Return ONLY JSON:
{
  "synopsis": "...",
  "the_mood": "...",
  "technique": ["label1"],
  "moods": ["tag1", "tag2", "tag3", "tag4"],
  "copy_notes": "optional note for the human editor",
  "technique_notes": "optional technique doubt for the human editor"
}
`.trim();
}

/**
 * @param {object} candidate
 * @param {object} draft
 * @param {object} factPack
 */
export function buildContentReviewerPrompt(candidate, draft, factPack) {
  const guide = getContentStyleGuide();
  const moodGuide = loadMoodWritingGuide();
  const moodGuideVersion = moodGuide?.version ?? MOOD_GUIDE_ID;
  return `
You are the Resonale lightweight Content reviewer.
Decide if the draft is usable for a human editor. Do NOT rewrite the text.
Do NOT request changes for missing "curatorial value", prettier wording, or deeper interpretation.
Do NOT FIX because technique is empty when sources do not confirm a production method — empty technique is preferred over an unverified guess.
Do NOT FIX only because synopsis mainly covers the setup.
Mood editorial polishing (generic tone, ornamental phrasing, batch repetition) is handled later by Mood Editor — do not restyle the_mood here.

Style guide version: ${guide.version}
Mood Writing Guide version: ${moodGuideVersion}

For the_mood, use the Mood Writing Guide only as a safety reference (not a full editorial rewrite brief):
${formatMoodWritingGuideForPrompt(moodGuide)}

Film: ${candidate.title} (${candidate.year})
Directors: ${(candidate.directors ?? []).join(", ")}
TMDB overview: ${factPack.tmdbOverview || "(none)"}
Technique evidence: ${JSON.stringify(factPack.techniqueEvidence ?? [])}

Draft:
synopsis: ${draft.synopsis}
the_mood: ${draft.the_mood}
technique: ${JSON.stringify(draft.technique)}
moods: ${JSON.stringify(draft.moods ?? [])}
copy_notes: ${draft.copy_notes ?? ""}
technique_notes: ${draft.technique_notes ?? ""}

Verdicts:
- PASS — usable and correct.
- PASS_WITH_NOTE — usable, but leave a concrete non-blocking note (TMDB-heavy synopsis, empty/unverified technique, slightly generic wording, possible distinctive technique to verify, mild mood template feel, a repeated word).
- FIX — only for significant problems: factual error, spoiler, broken English, clear ad copy, synopsis/mood substantial repetition, clearly wrong technique that contradicts evidence, non-technique label, unreadable text, excessive length, misleading unsupported specific claim.
- For technique: unsupported invented method (including generic 2D/3D with no evidence) → FIX to clear it or align with evidence. Empty technique with a verify note → PASS or PASS_WITH_NOTE, not FIX.
- For the_mood specifically, FIX only for severe safety/correctness: unnatural/broken English, empty/malformed line, clear synopsis duplication, or unconfirmed factual claim in the mood. Mild generic/template/ornamental feel → PASS_WITH_NOTE (Mood Editor handles editorial IMPROVE later). Do NOT FIX for a single shared construction with another film.

Issue details must be concrete actions (e.g. "remove unsupported hand-drawn", "shorten second clause"). Never say "add clearer curatorial value" or "make it more distinctive".

Return ONLY JSON:
{
  "verdict": "PASS" | "PASS_WITH_NOTE" | "FIX",
  "notes": ["optional non-blocking notes for PASS_WITH_NOTE"],
  "issues": [
    {
      "field": "synopsis" | "the_mood" | "technique" | "moods",
      "code": "factual_issue" | "spoiler" | "broken_english" | "ad_copy" | "repetition" | "wrong_technique" | "non_technique_label" | "excessive_length" | "unsupported_claim" | "unreadable" | "generic_mood" | "guide_violation",
      "detail": "concrete fix instruction"
    }
  ],
  "summary": "one short sentence"
}
If PASS, issues must be [] and notes may be [].
If PASS_WITH_NOTE, issues must be [] and notes must be non-empty.
If FIX, issues must be non-empty.
`.trim();
}

/**
 * Pure orchestration with injectable LLM + fact adapters (tests).
 *
 * @param {object} candidate
 * @param {{
 *   eligibilityResult?: string,
 *   gatherFactsFn?: Function,
 *   curatorFn?: Function,
 *   reviewerFn?: Function,
 *   revisionFn?: Function,
 * }} [options]
 */
export async function runContentPipelineForCandidate(candidate, options = {}) {
  const eligibility =
    options.eligibilityResult ?? candidate.eligibility_result ?? null;
  if (eligibility != null && eligibility !== DISCOVERY_ELIGIBILITY.pass) {
    return {
      skipped: true,
      reason: "eligibility_not_pass",
      content_status: candidate.content_status ?? DISCOVERY_CONTENT_STATUS.pending,
      writes_to_films_table: false,
      publish: false,
      review_status_unchanged: true,
      media_status_unchanged: true,
      email_sent: false,
    };
  }

  const identityBefore = {
    title: candidate.title,
    original_title: candidate.original_title,
    year: candidate.year,
    directors: candidate.directors,
    countries: candidate.countries,
    runtime_minutes: candidate.runtime_minutes,
  };

  const factPack = options.gatherFactsFn
    ? await options.gatherFactsFn(candidate)
    : await gatherContentFactPack(candidate, options);

  const curatorRaw = options.curatorFn
    ? await options.curatorFn(candidate, factPack)
    : null;

  if (!curatorRaw) {
    return {
      ...buildContentCandidatePatch({
        content_status: DISCOVERY_CONTENT_STATUS.failed,
        content_note: "Content draft incomplete.",
        content_revision_count: 0,
      }),
      diagnostics: {
        reviewer_branch: "processing_error",
        reviewer_not_run_reason: "curator_produced_no_draft",
        acceptance: "failed",
        fact_pack: factPack,
        sources: factPack.sources ?? [],
      },
      processing_error: "Content curator produced no draft",
    };
  }

  let draft = {
    synopsis: curatorRaw.synopsis,
    the_mood: curatorRaw.the_mood,
    technique: curatorRaw.technique,
    moods: curatorRaw.moods,
    copy_notes: curatorRaw.copy_notes ?? curatorRaw.notes ?? null,
    technique_notes: curatorRaw.technique_notes ?? null,
  };

  const validateOpts = {
    tmdbOverview: factPack.tmdbOverview,
    techniqueEvidence: factPack.techniqueEvidence ?? [],
    wikipediaOnlyDistinctive: factPack.wikipediaOnlyDistinctive ?? [],
  };

  let validated = validateDiscoveryContentDraft(draft, validateOpts);
  const initialSnapshot = {
    synopsis: validated.synopsis,
    the_mood: validated.the_mood,
    technique: validated.technique,
    moods: validated.moods,
    copy_notes: draft.copy_notes,
    technique_notes: draft.technique_notes,
    raw_technique: curatorRaw.technique,
    validation_issues: validated.issues,
    soft_notes: validated.softNotes,
    technique_diagnostics: validated.techniqueDiagnostics,
  };

  draft = {
    synopsis: validated.synopsis,
    the_mood: validated.the_mood,
    technique: validated.techniqueLabels.length
      ? validated.techniqueLabels
      : draft.technique,
    moods: validated.moods,
    copy_notes: draft.copy_notes,
    technique_notes: draft.technique_notes,
  };

  /** @type {"PASS" | "PASS_WITH_NOTE" | "FIX" | "not_run" | "processing_error"} */
  let reviewerBranch = "not_run";
  /** @type {string | null} */
  let reviewerNotRunReason = null;
  let review = null;

  if (!validated.synopsis || !validated.the_mood) {
    reviewerNotRunReason = "missing_synopsis_or_mood_after_curator";
  } else if (options.reviewerFn) {
    review = await options.reviewerFn(candidate, draft, factPack);
    const rawVerdict = String(review?.verdict ?? "")
      .toUpperCase()
      .replace(/\s+/g, "_");
    if (rawVerdict === "FIX" || rawVerdict === "REVISE") {
      reviewerBranch = DISCOVERY_CONTENT_VERDICT.fix;
    } else if (
      rawVerdict === "PASS_WITH_NOTE" ||
      rawVerdict === "PASS_WITH_NOTES"
    ) {
      reviewerBranch = DISCOVERY_CONTENT_VERDICT.passWithNote;
    } else {
      reviewerBranch = DISCOVERY_CONTENT_VERDICT.pass;
    }

    // Ignore legacy "curatorial value" as sole FIX reason.
    if (reviewerBranch === DISCOVERY_CONTENT_VERDICT.fix) {
      const issues = review?.issues ?? [];
      const onlyCuratorial =
        issues.length > 0 &&
        issues.every((issue) =>
          /CURATORIAL_VALUE|curatorial value|more distinctive|artistic significance/i.test(
            `${issue.code ?? ""} ${issue.detail ?? ""}`
          )
        );
      if (onlyCuratorial) {
        reviewerBranch = DISCOVERY_CONTENT_VERDICT.passWithNote;
        review = {
          ...review,
          verdict: DISCOVERY_CONTENT_VERDICT.passWithNote,
          notes: [
            ...(review?.notes ?? []),
            "Reviewer asked for deeper curatorial framing; kept as note only.",
          ],
          issues: [],
          summary: "Downgraded curatorial-only FIX to PASS_WITH_NOTE",
        };
      }
    }
  } else {
    review = {
      verdict: DISCOVERY_CONTENT_VERDICT.pass,
      issues: [],
      notes: [],
      summary: "No reviewer provided — treated as PASS for tests",
    };
    reviewerBranch = DISCOVERY_CONTENT_VERDICT.pass;
  }

  let revisionCount = 0;
  let finalDraft = { ...draft };
  let finalValidation = validated;

  if (reviewerBranch === DISCOVERY_CONTENT_VERDICT.fix) {
    const feedbackText = formatReviewerFeedback(review);
    if (options.revisionFn) {
      const revisedRaw = await options.revisionFn(
        candidate,
        draft,
        factPack,
        feedbackText
      );
      revisionCount = 1;
      finalDraft = {
        synopsis: revisedRaw?.synopsis ?? draft.synopsis,
        the_mood: revisedRaw?.the_mood ?? draft.the_mood,
        technique: revisedRaw?.technique ?? draft.technique,
        moods: revisedRaw?.moods ?? draft.moods,
        copy_notes: revisedRaw?.copy_notes ?? draft.copy_notes,
        technique_notes: revisedRaw?.technique_notes ?? draft.technique_notes,
      };
      finalValidation = validateDiscoveryContentDraft(finalDraft, validateOpts);
    } else {
      revisionCount = 1;
    }
  }

  const copyNotes = [
    finalDraft.copy_notes,
    ...(review?.notes ?? []),
    ...(finalValidation.softNotes ?? []).filter(
      (note) => !/technique/i.test(note)
    ),
    reviewerBranch === DISCOVERY_CONTENT_VERDICT.passWithNote
      ? review?.summary
      : null,
  ]
    .flat()
    .filter(Boolean);

  const techniqueNotes = [
    finalDraft.technique_notes,
    ...(finalValidation.techniqueNotes ?? []),
  ]
    .flat()
    .filter(Boolean);

  const uniqueCopyNotes = [...new Set(copyNotes.map(String))];
  const uniqueTechniqueNotes = [...new Set(techniqueNotes.map(String))];
  const content_note = composeContentNote([
    ...uniqueCopyNotes,
    ...uniqueTechniqueNotes,
  ]);
  const hasNotes = Boolean(content_note);

  let content_status = hasNotes
    ? DISCOVERY_CONTENT_STATUS.readyWithNote
    : DISCOVERY_CONTENT_STATUS.ready;

  if (!finalValidation.synopsis || !finalValidation.the_mood) {
    content_status = DISCOVERY_CONTENT_STATUS.failed;
    if (reviewerBranch === "not_run") {
      reviewerBranch = "processing_error";
    }
  }

  const acceptance = resolveContentAcceptance({
    revisionCount,
    verdict: reviewerBranch,
    status: content_status,
    hasNotes,
  });

  const patch = buildContentCandidatePatch({
    synopsis: finalValidation.synopsis,
    the_mood: finalValidation.the_mood,
    technique: finalValidation.technique,
    moods: finalValidation.moods,
    content_status,
    content_note:
      content_status === DISCOVERY_CONTENT_STATUS.failed && !content_note
        ? "Content draft incomplete."
        : content_note,
    content_revision_count: revisionCount,
  });

  return {
    ...patch,
    identity_before: identityBefore,
    identity_after: identityBefore,
    identity_unchanged: true,
    // Dry-run / log diagnostics only — not persisted to staging schema.
    diagnostics: {
      guide_version: CONTENT_STYLE_GUIDE_VERSION,
      mood_guide_version: loadMoodWritingGuide()?.version ?? MOOD_GUIDE_ID,
      reviewer_verdict:
        reviewerBranch === DISCOVERY_CONTENT_VERDICT.pass ||
        reviewerBranch === DISCOVERY_CONTENT_VERDICT.passWithNote ||
        reviewerBranch === DISCOVERY_CONTENT_VERDICT.fix
          ? reviewerBranch
          : null,
      reviewer_feedback: review ?? null,
      reviewer_branch: reviewerBranch,
      reviewer_not_run_reason: reviewerNotRunReason,
      acceptance,
      initial: revisionCount > 0 ? initialSnapshot : null,
      initial_synopsis: initialSnapshot.synopsis,
      initial_the_mood: initialSnapshot.the_mood,
      initial_technique: initialSnapshot.technique,
      initial_moods: initialSnapshot.moods,
      raw_technique_proposal: curatorRaw.technique ?? null,
      technique_diagnostics: finalValidation.techniqueDiagnostics ?? [],
      soft_notes: uniqueCopyNotes,
      technique_notes: uniqueTechniqueNotes,
      fact_pack: factPack,
      style_guide_version: CONTENT_STYLE_GUIDE_VERSION,
      mood_guide_version_detail: loadMoodWritingGuide()?.version ?? MOOD_GUIDE_ID,
      sources: factPack.sources ?? [],
      used_wikipedia_fallback: Boolean(factPack.usedWikipediaFallback),
      wikipedia_metrics: factPack.wikipediaMetrics ?? null,
      technique_evidence: factPack.techniqueEvidence ?? [],
      research_notes: factPack.researchNotes ?? [],
      initial_byte_equal_final:
        revisionCount === 0 &&
        initialSnapshot.synopsis === finalValidation.synopsis &&
        initialSnapshot.the_mood === finalValidation.the_mood &&
        initialSnapshot.technique === finalValidation.technique,
    },
    processing_error: null,
  };
}

export function formatReviewerFeedback(review) {
  const lines = [];
  if (review?.summary) lines.push(review.summary);
  for (const note of review?.notes ?? []) {
    lines.push(`- [note] ${note}`);
  }
  for (const issue of review?.issues ?? []) {
    lines.push(
      `- [${issue.field ?? "general"} / ${issue.code ?? "issue"}] ${issue.detail ?? ""}`
    );
  }
  return lines.join("\n");
}

/**
 * Real OpenAI-backed curator/reviewer adapters.
 * @param {object} candidate
 * @param {{
 *   openai: { chat: { completions: { create: Function } } },
 *   tmdbApiKey?: string,
 *   model?: string,
 * }} options
 */
export async function curateDiscoveryContent(candidate, options) {
  if (
    candidate.eligibility_result != null &&
    candidate.eligibility_result !== DISCOVERY_ELIGIBILITY.pass
  ) {
    return {
      skipped: true,
      reason: "eligibility_not_pass",
      content_status: candidate.content_status ?? DISCOVERY_CONTENT_STATUS.pending,
      writes_to_films_table: false,
      review_status_unchanged: true,
      media_status_unchanged: true,
      email_sent: false,
    };
  }

  const openai = options.openai;
  const model = options.model ?? "gpt-4.1-mini";

  async function chat(system, user) {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return parseJsonFromModelText(response.choices?.[0]?.message?.content);
  }

  return runContentPipelineForCandidate(candidate, {
    gatherFactsFn: (row) =>
      gatherContentFactPack(row, {
        tmdbApiKey: options.tmdbApiKey,
        enableWikipedia: options.enableWikipedia,
        enableSourceFetch: options.enableSourceFetch,
        researchDelayMs: options.researchDelayMs,
        wikipediaState: options.wikipediaState,
      }),
    curatorFn: async (row, factPack) =>
      chat(
        `You are ${CONTENT_CURATOR_ROLE}. Style guide version ${CONTENT_STYLE_GUIDE_VERSION}. Return JSON only.`,
        buildContentCuratorPrompt(row, factPack)
      ),
    reviewerFn: async (row, draft, factPack) =>
      chat(
        `You are ${CONTENT_REVIEWER_ROLE}. Style guide version ${CONTENT_STYLE_GUIDE_VERSION}. Return JSON only.`,
        buildContentReviewerPrompt(row, draft, factPack)
      ),
    revisionFn: async (row, draft, factPack, feedback) =>
      chat(
        `You are ${CONTENT_CURATOR_ROLE} doing a single revision. Style guide ${CONTENT_STYLE_GUIDE_VERSION}.`,
        buildContentCuratorPrompt(
          row,
          factPack,
          `Previous draft:\n${JSON.stringify(draft, null, 2)}\n\nReviewer feedback:\n${feedback}`
        )
      ),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {object[]} candidates
 * @param {{
 *   dryRun?: boolean,
 *   force?: boolean,
 *   delayMs?: number,
 *   skipEmail?: boolean,
 *   curateFn?: Function,
 *   updateFn?: Function,
 *   openai?: object,
 *   tmdbApiKey?: string,
 *   enableWikipedia?: boolean,
 *   enableSourceFetch?: boolean,
 *   batchRevisionFn?: Function,
 *   skipMoodGuideRewrite?: boolean,
 *   skipMoodEditor?: boolean,
 *   moodEditorFn?: Function,
 *   moodModel?: string,
 *   moodEditorModel?: string,
 *   model?: string,
 * }} options
 */
export async function runDiscoveryContentBatch(candidates, options = {}) {
  const delayMs = options.delayMs ?? 300;
  const wikipediaState =
    options.wikipediaState ?? createWikipediaResearchState({ delayMs: 8000 });
  const curateFn =
    options.curateFn ??
    ((candidate) =>
      curateDiscoveryContent(candidate, {
        openai: options.openai,
        tmdbApiKey: options.tmdbApiKey,
        enableWikipedia: options.enableWikipedia,
        enableSourceFetch: options.enableSourceFetch,
        wikipediaState,
      }));

  /** @type {object[]} */
  const results = [];
  let wouldUpdate = 0;
  let skippedComplete = 0;
  let passCount = 0;
  let passWithNoteCount = 0;
  let fixCount = 0;
  /** @type {string[]} */
  const overusedMoodOpenings = [];
  const moodGuide = loadMoodWritingGuide();

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!isContentResumeEligible(candidate, { force: options.force })) {
      skippedComplete += 1;
      results.push({
        id: candidate.id,
        title: candidate.title,
        skipped: true,
        reason: "already_ready_without_force",
        content_status: candidate.content_status,
      });
      continue;
    }

    if (
      candidate.eligibility_result != null &&
      candidate.eligibility_result !== DISCOVERY_ELIGIBILITY.pass &&
      !options.force
    ) {
      results.push({
        id: candidate.id,
        title: candidate.title,
        skipped: true,
        reason: "eligibility_not_pass",
        content_status: candidate.content_status ?? DISCOVERY_CONTENT_STATUS.pending,
      });
      continue;
    }

    let content;
    try {
      content = await curateFn(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      content = {
        ...buildContentCandidatePatch({
          content_status: DISCOVERY_CONTENT_STATUS.failed,
          content_note: "Content draft incomplete.",
          content_revision_count: 0,
        }),
        diagnostics: {
          reviewer_branch: "processing_error",
          reviewer_not_run_reason: "exception",
          acceptance: "failed",
          processing_error: message,
        },
        processing_error: message,
      };
    }

    // the_mood must come from Mood Writing Guide path (same as mood-only comparison),
    // not from the joint synopsis/technique curator draft alone.
    if (
      !content.skipped &&
      content.synopsis &&
      content.the_mood &&
      options.openai &&
      moodGuide &&
      options.skipMoodGuideRewrite !== true
    ) {
      try {
        const moodRewrite = await rewriteMoodForFilm(
          {
            id: candidate.id,
            title: candidate.title,
            year: candidate.year,
            synopsis: content.synopsis,
            moods: content.moods ?? [],
            technique: content.technique,
            previous_the_mood: content.the_mood,
            the_mood: content.the_mood,
          },
          {
            openai: options.openai,
            guide: moodGuide,
            model: options.moodModel ?? options.model ?? "gpt-4.1-mini",
            overused: overusedMoodOpenings,
          }
        );
        content.the_mood = moodRewrite.new_the_mood;
        content.diagnostics = {
          ...(content.diagnostics ?? {}),
          mood_guide_rewrite: {
            guide_version: moodRewrite.guide_version,
            previous_the_mood: moodRewrite.previous_the_mood,
            writer_draft: moodRewrite.new_the_mood,
            unchanged: moodRewrite.unchanged,
            principles_applied: moodRewrite.principles_applied,
            reviewer_verdict: moodRewrite.reviewer_verdict,
            writer_note: moodRewrite.writer_note,
          },
        };
        const flags = flagMoodPatterns(moodRewrite.new_the_mood);
        if (flags.has_stock_opening || flags.has_adj_pair_opening) {
          const count = results.filter(
            (row) =>
              !row.skipped &&
              flagMoodPatterns(row.the_mood ?? "").opening === flags.opening
          ).length;
          if (count >= 1 && !overusedMoodOpenings.includes(flags.opening)) {
            overusedMoodOpenings.push(flags.opening);
          }
        }
      } catch (moodError) {
        content.diagnostics = {
          ...(content.diagnostics ?? {}),
          mood_guide_rewrite_error:
            moodError instanceof Error ? moodError.message : String(moodError),
        };
      }
    }

    const diagnostics = content.diagnostics ?? {};
    const rawVerdict = String(
      diagnostics.reviewer_branch ?? diagnostics.reviewer_verdict ?? ""
    ).toUpperCase();
    let reviewerBranch = "processing_error";
    if (content.skipped) reviewerBranch = "not_run";
    else if (rawVerdict === "PASS") reviewerBranch = "PASS";
    else if (rawVerdict === "PASS_WITH_NOTE" || rawVerdict === "PASS_WITH_NOTES")
      reviewerBranch = "PASS_WITH_NOTE";
    else if (rawVerdict === "FIX" || rawVerdict === "REVISE") reviewerBranch = "FIX";
    else if (diagnostics.reviewer_branch === "not_run") reviewerBranch = "not_run";
    else if (diagnostics.reviewer_branch === "processing_error")
      reviewerBranch = "processing_error";

    if (reviewerBranch === "PASS") passCount += 1;
    if (reviewerBranch === "PASS_WITH_NOTE") passWithNoteCount += 1;
    if (reviewerBranch === "FIX") fixCount += 1;

    const persistPatch = buildContentCandidatePatch({
      synopsis: content.synopsis,
      the_mood: content.the_mood,
      technique: content.technique,
      moods: content.moods,
      content_status: content.content_status,
      content_note: content.content_note,
      content_revision_count: content.content_revision_count ?? 0,
    });
    // Strip non-DB flags from persist patch
    const {
      writes_to_films_table: _w,
      publish: _p,
      enrich_full: _e,
      review_status_unchanged: _r,
      media_status_unchanged: _m,
      identity_fields_unchanged: _i,
      email_sent: _email,
      ...dbOnly
    } = persistPatch;

    results.push({
      id: candidate.id,
      title: candidate.title,
      year: candidate.year,
      synopsis: content.synopsis ?? null,
      the_mood: content.the_mood ?? null,
      technique: content.technique ?? null,
      moods: content.moods ?? null,
      content_status: content.content_status,
      content_note: content.content_note ?? null,
      content_revision_count: content.content_revision_count ?? 0,
      content_updated_at: persistPatch.content_updated_at,
      skipped: Boolean(content.skipped),
      skip_reason: content.skipped ? content.reason ?? null : null,
      // Dry-run artifact only
      diagnostics: {
        ...diagnostics,
        reviewer_branch: reviewerBranch,
        processing_error:
          content.processing_error ?? diagnostics.processing_error ?? null,
      },
      _persistPatch: dbOnly,
      _candidateId: candidate.id,
    });

    if (content.skipped) continue;
    wouldUpdate += 1;

    if (delayMs > 0 && index < candidates.length - 1) {
      await sleep(delayMs);
    }
  }

  // Second pass: batch Mood Editor (KEEP | IMPROVE). Writes replacements itself.
  // Diagnostics stay on run artifacts only — never permanent staging columns.
  /** @type {object | null} */
  let moodEditorSummary = null;
  if (
    options.skipMoodEditor !== true &&
    moodGuide &&
    (options.openai || options.moodEditorFn)
  ) {
    const editorPass = await runMoodEditorPass(results, {
      openai: options.openai,
      guide: moodGuide,
      model: options.moodEditorModel ?? options.moodModel ?? options.model ?? "gpt-4.1-mini",
      editorFn: options.moodEditorFn,
    });
    results.length = 0;
    results.push(...editorPass.rows);
    moodEditorSummary = editorPass.summary;
  }

  const audited = await applyBatchEditorialAudit(results);
  const finalResults = audited.results;

  if (!options.dryRun && options.updateFn) {
    for (const row of finalResults) {
      if (row.skipped || !row._candidateId) continue;
      const patch = {
        synopsis: row.synopsis,
        the_mood: row.the_mood,
        technique: row.technique,
        moods: row.moods,
        content_status: row.content_status,
        content_note: row.content_note,
        content_revision_count: row.content_revision_count,
        content_updated_at: new Date().toISOString(),
      };
      await options.updateFn(row._candidateId, patch);
    }
  }

  for (const row of finalResults) {
    delete row._persistPatch;
    delete row._candidateId;
  }

  const processed = finalResults.filter((row) => !row.skipped);
  const reviewerNotRun = processed.filter(
    (row) => row.diagnostics?.reviewer_branch === "not_run"
  );
  const processingErrors = processed.filter(
    (row) => row.diagnostics?.reviewer_branch === "processing_error"
  );

  const unknownTechniqueRows = [];
  for (const row of processed) {
    for (const diag of row.diagnostics?.technique_diagnostics ?? []) {
      if (
        [
          "visual_style",
          "too_detailed",
          "possible_new",
          "unconfirmed",
          "contextual_non_technique",
        ].includes(diag.kind)
      ) {
        unknownTechniqueRows.push({
          title: row.title,
          year: row.year,
          raw: diag.raw,
          kind: diag.kind,
          normalized: diag.normalized,
          closeMatches: diag.closeMatches,
          reason: diag.reason,
          final_technique: row.technique,
          content_status: row.content_status,
          sources: row.diagnostics?.sources ?? [],
        });
      }
    }
  }

  const tallies = {
    total: candidates.length,
    eligible: processed.length,
    skipped: finalResults.filter((row) => row.skipped).length,
    skipped_breakdown: {
      already_ready_without_force: skippedComplete,
      eligibility_not_pass: finalResults.filter(
        (row) => row.skipped && row.skip_reason === "eligibility_not_pass"
      ).length,
    },
    reviewer_pass: passCount,
    reviewer_pass_with_note: passWithNoteCount,
    reviewer_fix: fixCount,
    reviewer_not_run: reviewerNotRun.length,
    processing_errors: processingErrors.length,
    reviewer_branch_sum:
      passCount +
      passWithNoteCount +
      fixCount +
      reviewerNotRun.length +
      processingErrors.length,
    revisions_performed: processed.filter(
      (row) => (row.content_revision_count ?? 0) >= 1
    ).length,
    ready: finalResults.filter(
      (row) => row.content_status === DISCOVERY_CONTENT_STATUS.ready
    ).length,
    ready_with_note: finalResults.filter(
      (row) => row.content_status === DISCOVERY_CONTENT_STATUS.readyWithNote
    ).length,
    failed: finalResults.filter(
      (row) => row.content_status === DISCOVERY_CONTENT_STATUS.failed
    ).length,
    cards_with_content_note: processed.filter((row) => row.content_note).length,
    main_descriptions_generated: finalResults.filter((row) => row.synopsis).length,
    mood_descriptions_generated: finalResults.filter((row) => row.the_mood).length,
    technique_labels_generated: finalResults.filter((row) => row.technique).length,
    unknown_technique_labels: unknownTechniqueRows.length,
    repeated_mood_openings: audited.tallies.repeated_mood_openings,
    repeated_synopsis_openings: audited.tallies.repeated_synopsis_openings,
    generic_wording_flags: audited.tallies.generic_wording_flags,
    batch_notes: audited.tallies.batch_notes,
    mood_editor_keep: moodEditorSummary?.KEEP ?? null,
    mood_editor_improve: moodEditorSummary?.IMPROVE ?? null,
    mood_editor_improve_applied: moodEditorSummary?.improve_applied ?? null,
    mood_editor_fallback: moodEditorSummary?.improve_fallback_to_writer ?? null,
    would_update: wouldUpdate,
    wikipedia_requests: wikipediaState.requests,
    wikipedia_hits: wikipediaState.hits,
    wikipedia_ambiguous: wikipediaState.ambiguous,
    wikipedia_errors: wikipediaState.errors,
    candidates_using_wikipedia_fallback: processed.filter(
      (row) => row.diagnostics?.used_wikipedia_fallback
    ).length,
  };

  return {
    dryRun: Boolean(options.dryRun),
    databaseMutated:
      !options.dryRun && wouldUpdate > 0 && Boolean(options.updateFn),
    writes_to_films_table: false,
    review_status_unchanged: true,
    media_status_unchanged: true,
    email_sent: false,
    skipEmail: options.skipEmail !== false,
    style_guide_version: CONTENT_STYLE_GUIDE_VERSION,
    mood_guide_version: loadMoodWritingGuide()?.version ?? MOOD_GUIDE_ID,
    tallies,
    // Artifact only — not written to film_discovery_candidates columns.
    mood_editor: moodEditorSummary,
    batch_audit: audited.analysis,
    unknown_technique_details: unknownTechniqueRows,
    results: finalResults,
    arithmetic_check: {
      reviewer_branches: tallies.reviewer_branch_sum,
      plus_skipped: tallies.skipped,
      equals_total:
        tallies.reviewer_branch_sum + tallies.skipped === tallies.total,
      status_sum:
        tallies.ready + tallies.ready_with_note + tallies.failed + tallies.skipped,
    },
  };
}

export { getContentStyleGuide, CONTENT_STYLE_GUIDE_VERSION };
export { composeContentNote } from "./film-discovery-content-note.mjs";
