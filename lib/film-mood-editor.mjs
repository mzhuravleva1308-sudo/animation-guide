/**
 * Batch Mood Editor pass for discovery content.
 *
 * Runs after Mood Writer drafts exist. Sees the whole current batch,
 * returns KEEP | IMPROVE, and writes IMPROVE replacements itself.
 * Diagnostics stay in run artifacts — never permanent staging columns.
 */

import { parseJsonFromModelText } from "./film-discovery-workflow.mjs";
import {
  cleanupEditorialField,
  validateMoodOnly,
} from "./film-editorial-copy.mjs";
import {
  formatMoodWritingGuideForPrompt,
  loadMoodWritingGuide,
  MOOD_GUIDE_ID,
} from "./film-mood-writing-guide.mjs";
import { measureMoodBatchMetrics } from "./film-mood-only-rewrite.mjs";

export const MOOD_EDITOR_ISSUE_CODES = Object.freeze([
  "generic_interchangeable",
  "mini_analysis_or_theme",
  "ornamental_review_copy",
  "awkward_english",
  "repeated_template_wording",
  "synopsis_repetition",
  "unsupported_interpretation",
  "abstract_intensifier_tail",
  "shared_medium_filler",
  "mood_not_named_early",
]);

const ISSUE_CODE_SET = new Set(MOOD_EDITOR_ISSUE_CODES);

/**
 * @param {object[]} films — writer drafts for the current batch only
 * @param {object | null} guide
 */
export function buildMoodEditorPrompt(films, guide) {
  const guideBlock = formatMoodWritingGuideForPrompt(
    guide ?? loadMoodWritingGuide()
  );
  const cards = (films ?? [])
    .map((film, index) => {
      const technique =
        film.technique == null || film.technique === ""
          ? "(none)"
          : JSON.stringify(film.technique);
      return `
[${index + 1}] title: ${film.title}
synopsis: ${film.synopsis ?? ""}
technique: ${technique}
writer_the_mood: ${film.the_mood ?? film.writer_the_mood ?? ""}
`.trim();
    })
    .join("\n\n");

  return `
You are the Resonale Mood Editor for one weekly discovery/content batch.
You receive every writer the_mood draft in this batch at once.

Your job:
1. Judge each line as KEEP or IMPROVE.
2. When IMPROVE, write the revised_the_mood yourself.
3. Do NOT ask for another writer pass. Do NOT regenerate KEEP lines.

Core rule:
"Do not rewrite a good line merely because another phrasing is possible. IMPROVE only when the replacement is noticeably better."

IMPROVE only for:
- generic / interchangeable across unrelated films
- mini-analysis or theme instead of watching-feel ("what does watching feel like?")
- ornamental review copy / film-criticism prose
- awkward English
- abstract intensifier tail after a good mood opening (slow/fast/energetic pacing, quiet moments, dark tension, bleak atmosphere, vibes)
- shared-medium filler (e.g. "with rough/soft/vivid 2D animation" when most films in the batch share ordinary 2D)
- mood not named in the first few words
- synopsis repetition
- unsupported interpretation

NOT reasons to IMPROVE by themselves:
- a shared word (quiet, muted, intimate) when earned
- a shared grammatical shape / Adj opening when the line remains film-specific
- wanting more variety for its own sake
- mentioning distinctive technique (stop-motion puppets, rotoscope, stark B&W) when it shapes the feel

When IMPROVE: keep mood-first; replace filler with a concrete film-owned cue (place, image, sound, behavior, contrast).

Use the active Mood Writing Guide as editorial guidance (not a hard quota sheet):
${guideBlock}

Batch cards:
${cards || "(none)"}

Return ONLY JSON:
{
  "batch_observations": ["optional short notes about emergent batch patterns"],
  "decisions": [
    {
      "title": "exact film title",
      "decision": "KEEP" | "IMPROVE",
      "issue_codes": ["generic_interchangeable"],
      "revised_the_mood": "only when IMPROVE; otherwise omit or null",
      "issue": "short reason only when IMPROVE"
    }
  ]
}

Rules for decisions:
- Include every film title from the batch exactly once.
- KEEP: issue_codes must be [] / omitted; revised_the_mood must be null/omitted.
- IMPROVE: issue_codes must be non-empty using only: ${MOOD_EDITOR_ISSUE_CODES.join(", ")}.
- IMPROVE revised_the_mood must stay one compact mood line, film-rooted, and not retell the synopsis.
`.trim();
}

/**
 * @param {unknown} raw
 * @param {object[]} films
 */
export function normalizeMoodEditorResponse(raw, films) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const byTitle = new Map(
    (films ?? []).map((film) => [String(film.title), film])
  );
  const seen = new Set();
  /** @type {object[]} */
  const decisions = [];

  for (const row of Array.isArray(payload.decisions) ? payload.decisions : []) {
    const title = String(row?.title ?? "").trim();
    if (!title || !byTitle.has(title) || seen.has(title)) continue;
    seen.add(title);

    const decision =
      String(row?.decision ?? "KEEP").toUpperCase() === "IMPROVE"
        ? "IMPROVE"
        : "KEEP";
    const issueCodes = Array.isArray(row?.issue_codes)
      ? row.issue_codes
          .map((code) => String(code))
          .filter((code) => ISSUE_CODE_SET.has(code))
      : [];
    const revised = cleanupEditorialField(row?.revised_the_mood ?? "");

    if (decision === "IMPROVE" && revised && issueCodes.length) {
      decisions.push({
        title,
        decision: "IMPROVE",
        issue_codes: issueCodes,
        revised_the_mood: revised,
        issue: row?.issue ? String(row.issue) : null,
      });
    } else {
      decisions.push({
        title,
        decision: "KEEP",
        issue_codes: [],
        revised_the_mood: null,
        issue: null,
      });
    }
  }

  // Missing titles default to KEEP (do not invent IMPROVE).
  for (const film of films ?? []) {
    const title = String(film.title);
    if (seen.has(title)) continue;
    decisions.push({
      title,
      decision: "KEEP",
      issue_codes: [],
      revised_the_mood: null,
      issue: null,
      missing_from_editor: true,
    });
  }

  const observations = Array.isArray(payload.batch_observations)
    ? payload.batch_observations.map((item) => String(item)).filter(Boolean)
    : [];

  return { decisions, batch_observations: observations };
}

/**
 * Apply one editorial pass. Invalid IMPROVE revisions fall back to writer draft.
 * Does not mutate synopsis / technique / moods.
 *
 * @param {object[]} rows
 * @param {{ decisions?: object[], batch_observations?: string[] }} editorResult
 */
export function applyMoodEditorToBatch(rows, editorResult = {}) {
  const decisionByTitle = new Map(
    (editorResult.decisions ?? []).map((row) => [row.title, row])
  );

  /** @type {Record<string, number>} */
  const issueBreakdown = {};
  let keepCount = 0;
  let improveCount = 0;
  let appliedImproveCount = 0;
  let fallbackCount = 0;

  const nextRows = (rows ?? []).map((row) => {
    if (row.skipped || !row.the_mood) {
      return row;
    }

    const writerDraft = cleanupEditorialField(
      row.diagnostics?.mood_editor?.writer_draft ??
        row.writer_the_mood ??
        row.the_mood
    );
    const decision = decisionByTitle.get(row.title) ?? {
      title: row.title,
      decision: "KEEP",
      issue_codes: [],
      revised_the_mood: null,
      issue: null,
    };

    /** @type {object} */
    const moodEditorDiag = {
      decision: decision.decision,
      issue_codes: decision.issue_codes ?? [],
      issue: decision.issue ?? null,
      writer_draft: writerDraft,
      revised_the_mood: null,
      applied: false,
      fallback_reason: null,
      missing_from_editor: Boolean(decision.missing_from_editor),
    };

    if (decision.decision === "KEEP") {
      keepCount += 1;
      return {
        ...row,
        the_mood: writerDraft,
        diagnostics: {
          ...(row.diagnostics ?? {}),
          mood_editor: moodEditorDiag,
        },
      };
    }

    improveCount += 1;
    for (const code of decision.issue_codes ?? []) {
      issueBreakdown[code] = (issueBreakdown[code] ?? 0) + 1;
    }

    const revised = cleanupEditorialField(decision.revised_the_mood ?? "");
    moodEditorDiag.revised_the_mood = revised || null;
    const validation = validateMoodOnly(revised, row.synopsis ?? "");

    if (!revised || validation.issues.length) {
      fallbackCount += 1;
      moodEditorDiag.applied = false;
      moodEditorDiag.fallback_reason = revised
        ? `validation_failed: ${validation.issues.join("; ")}`
        : "empty_revision";
      return {
        ...row,
        the_mood: writerDraft,
        diagnostics: {
          ...(row.diagnostics ?? {}),
          mood_editor: moodEditorDiag,
        },
      };
    }

    appliedImproveCount += 1;
    moodEditorDiag.applied = true;
    moodEditorDiag.revised_the_mood = validation.the_mood || revised;
    return {
      ...row,
      the_mood: validation.the_mood || revised,
      // Explicitly preserve other content fields
      synopsis: row.synopsis,
      technique: row.technique,
      moods: row.moods,
      diagnostics: {
        ...(row.diagnostics ?? {}),
        mood_editor: moodEditorDiag,
      },
    };
  });

  const finalMoods = nextRows
    .filter((row) => !row.skipped && row.the_mood)
    .map((row) => ({ the_mood: row.the_mood }));

  return {
    rows: nextRows,
    summary: {
      total_reviewed: keepCount + improveCount,
      KEEP: keepCount,
      IMPROVE: improveCount,
      improve_applied: appliedImproveCount,
      improve_fallback_to_writer: fallbackCount,
      issue_breakdown: issueBreakdown,
      batch_observations: editorResult.batch_observations ?? [],
      batch_metrics_after: measureMoodBatchMetrics(finalMoods),
      editorial_passes: 1,
      guide_auto_updated: false,
      writes_to_films_table: false,
      review_status_unchanged: true,
      permanent_fields_touched: ["the_mood"],
    },
  };
}

/**
 * @param {object[]} rows
 * @param {{
 *   openai?: { chat: { completions: { create: Function } } },
 *   guide?: object | null,
 *   model?: string,
 *   editorFn?: Function,
 * }} [options]
 */
export async function runMoodEditorPass(rows, options = {}) {
  const eligible = (rows ?? []).filter(
    (row) => !row.skipped && row.the_mood && row.synopsis
  );
  if (!eligible.length) {
    return {
      rows: rows ?? [],
      summary: {
        total_reviewed: 0,
        KEEP: 0,
        IMPROVE: 0,
        improve_applied: 0,
        improve_fallback_to_writer: 0,
        issue_breakdown: {},
        batch_observations: [],
        skipped: true,
        reason: "no_eligible_mood_drafts",
        editorial_passes: 0,
        guide_auto_updated: false,
        writes_to_films_table: false,
      },
    };
  }

  const guide = options.guide ?? loadMoodWritingGuide();
  const editorFn =
    options.editorFn ??
    (async (films) => {
      if (!options.openai) {
        throw new Error("Mood Editor requires openai or editorFn");
      }
      const response = await options.openai.chat.completions.create({
        model: options.model ?? "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return JSON only." },
          {
            role: "user",
            content: buildMoodEditorPrompt(films, guide),
          },
        ],
      });
      return parseJsonFromModelText(response.choices?.[0]?.message?.content);
    });

  const films = eligible.map((row) => ({
    title: row.title,
    synopsis: row.synopsis,
    technique: row.technique ?? null,
    the_mood: row.the_mood,
    writer_the_mood: row.the_mood,
  }));

  let normalized;
  try {
    const raw = await editorFn(films);
    normalized = normalizeMoodEditorResponse(raw, films);
  } catch (error) {
    // Fail soft: keep writer drafts, record artifact diagnostic only.
    const message = error instanceof Error ? error.message : String(error);
    const kept = (rows ?? []).map((row) => {
      if (row.skipped || !row.the_mood) return row;
      return {
        ...row,
        diagnostics: {
          ...(row.diagnostics ?? {}),
          mood_editor: {
            decision: "KEEP",
            issue_codes: [],
            issue: null,
            writer_draft: row.the_mood,
            revised_the_mood: null,
            applied: false,
            fallback_reason: `editor_error: ${message}`,
          },
        },
      };
    });
    return {
      rows: kept,
      summary: {
        total_reviewed: eligible.length,
        KEEP: eligible.length,
        IMPROVE: 0,
        improve_applied: 0,
        improve_fallback_to_writer: 0,
        issue_breakdown: {},
        batch_observations: [],
        editor_error: message,
        editorial_passes: 0,
        guide_auto_updated: false,
        writes_to_films_table: false,
        guide_version: guide?.version ?? guide?.final_guide?.version ?? MOOD_GUIDE_ID,
      },
    };
  }

  const applied = applyMoodEditorToBatch(rows, normalized);
  return {
    rows: applied.rows,
    summary: {
      ...applied.summary,
      guide_version: guide?.version ?? guide?.final_guide?.version ?? MOOD_GUIDE_ID,
    },
  };
}
