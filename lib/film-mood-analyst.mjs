/**
 * Mood analyst: builds Resonale Mood Writing Guide from a cleaned corpus.
 * Max cycle: initial guide → self-review → one revised guide.
 */

import { parseJsonFromModelText } from "./film-discovery-workflow.mjs";
import { MOOD_GUIDE_ID } from "./film-mood-writing-guide.mjs";

function guideSections(guide) {
  return guide?.sections ?? guide ?? {};
}

function exampleCount(guide, key) {
  const sections = guideSections(guide);
  return Array.isArray(sections[key]) ? sections[key].length : 0;
}

/**
 * If revised guide drops below required example counts, keep the richer list.
 * @param {object} initialGuide
 * @param {object} finalGuide
 */
export function mergeGuideExamples(initialGuide, finalGuide) {
  const initial = guideSections(initialGuide);
  const final = guideSections(finalGuide);
  const out = finalGuide?.sections
    ? { ...finalGuide, sections: { ...finalGuide.sections } }
    : { sections: { ...final } };

  if (
    exampleCount({ sections: out.sections }, "good_examples") < 15 &&
    exampleCount({ sections: initial }, "good_examples") >= 15
  ) {
    out.sections.good_examples = initial.good_examples;
  }
  if (
    exampleCount({ sections: out.sections }, "anti_examples") < 8 &&
    exampleCount({ sections: initial }, "anti_examples") >= 8
  ) {
    out.sections.anti_examples = initial.anti_examples;
  }
  return out;
}

/**
 * @param {object} corpusReport — from prepareMoodCorpus
 */
export function buildMoodAnalystInitialPrompt(corpusReport) {
  const sample = (corpusReport.corpus ?? []).map((row) => ({
    title: row.title,
    year: row.year,
    technique: row.technique,
    the_mood: row.the_mood,
    moods: row.moods,
  }));

  return `
You are the Resonale Mood Analyst.
You do NOT write a mood for one film.
You study the cleaned catalog corpus of the_mood lines (+ moods tags) and produce a compact editorial guide for writing NEW the_mood lines in the same house style.

Corpus stats:
${JSON.stringify(
  {
    included: corpusReport.included_in_corpus,
    excluded: corpusReport.excluded,
    exclusion_reasons: corpusReport.exclusion_reasons,
    near_duplicates: corpusReport.near_duplicates,
    repeated_openings: corpusReport.repeated_openings,
    word_stats: corpusReport.stats,
  },
  null,
  2
)}

Important:
- Frequent pattern ≠ good pattern. Separate house style from accumulated weak templates.
- Do not invent rules disconnected from this corpus.
- Keep the guide short enough to embed in a writer prompt (except example lists).
- Good examples must come from the corpus texts below (quote the_mood exactly).
- Anti-examples should also come from the corpus when possible.
- HARD REQUIREMENT: good_examples MUST contain 15–25 items; anti_examples MUST contain 8–15 items.
- Diversify good examples across emotional profiles, syntax shapes, eras/techniques. No repeated openings among good_examples.
- Explicitly analyze these weak constructions (when weak vs when earned): "X and Y, with a steady rhythm…", "with a tense atmosphere", "underscored by", "marked by", "a blend of", "raw energy", "distinctive", generic quirky/dreamlike/reflective.
- Do NOT treat the most frequent openings ("warm and", "vibrant and", "playful and", …) as house style to copy — treat frequency as a risk of accumulated template.

Full cleaned corpus:
${JSON.stringify(sample, null, 2)}

Return ONLY JSON with this shape:
{
  "version": "${MOOD_GUIDE_ID}",
  "sections": {
    "purpose": "string",
    "core_principles": ["..."],
    "mood_dimensions": [{"name":"...","detail":"..."}],
    "strong_patterns": [{"principle":"...","why":"..."}],
    "weak_patterns": [{"pattern":"...","when_weak":"...","when_ok":"..."}],
    "syntax_library": [{"type":"...","principle":"..."}],
    "specificity_test": "string",
    "relationship_with_synopsis": "string",
    "relationship_with_moods_tags": "string",
    "good_examples": [{"title":"...","the_mood":"...","moods":[],"why":"..."}],
    "anti_examples": [{"title":"...","the_mood":"...","why":"...","acceptable_but_weak":true}]
  },
  "analyst_notes": "short notes on what is house style vs weak repetition",
  "counts": {"good_examples": 0, "anti_examples": 0}
}
counts.good_examples and counts.anti_examples must match array lengths and meet the HARD REQUIREMENT.
`.trim();
}

/**
 * @param {object} initialGuide
 * @param {object} corpusReport
 */
export function buildMoodAnalystSelfReviewPrompt(initialGuide, corpusReport) {
  return `
You are reviewing a draft Resonale Mood Writing Guide you produced.
Be critical. This guide will steer all new the_mood generation.

Draft guide:
${JSON.stringify(initialGuide, null, 2)}

Corpus context:
included=${corpusReport.included_in_corpus}, excluded=${corpusReport.excluded},
repeated_openings=${JSON.stringify(corpusReport.repeated_openings?.slice?.(0, 10) ?? [])}

Self-review checklist:
- Did the guide become generic writing tips unrelated to Resonale?
- Is it truly grounded in the corpus?
- Does it accidentally enshrine the most frequent WEAK templates?
- Is it compact enough for a prompt?
- Are rules contradictory?
- Are criteria actionable?
- Does good_examples have 15–25 corpus quotes and anti_examples 8–15? If not, REVISE and restore full lists.

Return ONLY JSON:
{
  "verdict": "ACCEPT" | "REVISE",
  "issues": ["..."],
  "summary": "one short paragraph",
  "revised_guide": null | { same shape as the draft guide object }
}
If ACCEPT, revised_guide must be null.
If REVISE, provide full revised_guide (not a patch), keeping 15–25 good_examples and 8–15 anti_examples from the corpus.
`.trim();
}

/**
 * @param {object} corpusReport
 * @param {{
 *   openai: { chat: { completions: { create: Function } } },
 *   model?: string,
 * }} options
 */
export async function runMoodAnalyst(corpusReport, options) {
  const openai = options.openai;
  const model = options.model ?? "gpt-4.1";

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

  const initialGuide = await chat(
    "You are Resonale Mood Analyst. Return JSON only. Obey example-count HARD REQUIREMENTS.",
    buildMoodAnalystInitialPrompt(corpusReport)
  );

  const selfReview = await chat(
    "You are Resonale Mood Analyst doing self-review. Return JSON only. Preserve 15–25 good and 8–15 anti examples.",
    buildMoodAnalystSelfReviewPrompt(initialGuide, corpusReport)
  );

  let finalGuide =
    String(selfReview?.verdict ?? "").toUpperCase() === "REVISE" &&
    selfReview?.revised_guide
      ? selfReview.revised_guide
      : initialGuide;

  finalGuide = mergeGuideExamples(initialGuide, finalGuide);

  return {
    version: MOOD_GUIDE_ID,
    generated_at: new Date().toISOString(),
    model,
    corpus_size: corpusReport.included_in_corpus,
    excluded_record_count: corpusReport.excluded,
    corpus_snapshot: {
      total_mood_records: corpusReport.total_mood_records,
      included_in_corpus: corpusReport.included_in_corpus,
      excluded: corpusReport.excluded,
      exclusion_reasons: corpusReport.exclusion_reasons,
      near_duplicates: corpusReport.near_duplicates,
      repeated_openings: corpusReport.repeated_openings,
      stats: corpusReport.stats,
    },
    initial_guide: initialGuide,
    self_review: {
      verdict: selfReview?.verdict ?? null,
      issues: selfReview?.issues ?? [],
      summary: selfReview?.summary ?? null,
    },
    final_guide: finalGuide,
  };
}
