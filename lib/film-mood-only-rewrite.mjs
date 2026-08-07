/**
 * Mood-only rewrite + comparison against Mood Writing Guide.
 * Does not touch synopsis / technique / moods tags / films table.
 */

import { parseJsonFromModelText } from "./film-discovery-workflow.mjs";
import {
  cleanupEditorialField,
  countWords,
  EDITORIAL_COPY_LIMITS,
  validateMoodOnly,
} from "./film-editorial-copy.mjs";
import { moodOpeningKey, moodTokenOverlap } from "./film-mood-corpus.mjs";
import {
  formatMoodWritingGuideForPrompt,
  loadMoodWritingGuide,
  MOOD_GUIDE_ID,
  selectRelevantMoodExamples,
} from "./film-mood-writing-guide.mjs";

const RHYTHM_RE = /\bwith a\b[^.!?]{0,40}\brhythm\b/i;
const GENERIC_RE =
  /\b(quirky|dreamlike|reflective|raw energy|distinctive|a blend of|underscored by|marked by|with a tense atmosphere)\b/i;
const STOCK_OPENING_RE =
  /^(fast-paced and|dark and|quiet and|tense and|darkly comic|warm and|soft and|serious and|raw and|dreamy and|energetic and)\b/i;
const ADJ_PAIR_OPENING_RE =
  /^[A-Za-z][A-Za-z-]*\s+and\s+[A-Za-z][A-Za-z-]*/;
const ORNAMENTAL_RE =
  /\b(flickering|reveries|desolation|embrace|secret desires|tender contradictions|amid frozen|weaving (?:a |playful|fragile)|pulsing with|drifts through|shadows and secret|melancholic embrace|suburban reveries)\b/i;

/**
 * @param {string} text
 */
export function flagMoodPatterns(text) {
  const mood = cleanupEditorialField(text);
  return {
    opening: moodOpeningKey(mood),
    has_with_a_rhythm: RHYTHM_RE.test(mood),
    has_generic_wording: GENERIC_RE.test(mood),
    has_stock_opening: STOCK_OPENING_RE.test(mood),
    has_adj_pair_opening: ADJ_PAIR_OPENING_RE.test(mood),
    has_ornamental_wording: ORNAMENTAL_RE.test(mood),
  };
}

/**
 * @param {object[]} rows — { the_mood }
 */
export function measureMoodBatchMetrics(rows) {
  const moods = (rows ?? [])
    .map((row) => cleanupEditorialField(row.the_mood))
    .filter(Boolean);

  /** @type {Record<string, number>} */
  const openings = {};
  let rhythm = 0;
  let generic = 0;
  let stock = 0;
  let adjPair = 0;
  let ornamental = 0;
  for (const mood of moods) {
    const flags = flagMoodPatterns(mood);
    openings[flags.opening] = (openings[flags.opening] ?? 0) + 1;
    if (flags.has_with_a_rhythm) rhythm += 1;
    if (flags.has_generic_wording) generic += 1;
    if (flags.has_stock_opening) stock += 1;
    if (flags.has_adj_pair_opening) adjPair += 1;
    if (flags.has_ornamental_wording) ornamental += 1;
  }

  const repeatedOpenings = Object.entries(openings)
    .filter(([, count]) => count >= 3)
    .map(([opening, count]) => ({ opening, count }))
    .sort((a, b) => b.count - a.count);

  let nearDupPairs = 0;
  for (let i = 0; i < moods.length; i += 1) {
    for (let j = i + 1; j < moods.length; j += 1) {
      if (moodTokenOverlap(moods[i], moods[j]) >= 0.82) nearDupPairs += 1;
    }
  }

  // Interchangeable: same opening + high token overlap family size
  const interchangeable = repeatedOpenings.filter((row) => row.count >= 4).length;

  return {
    total: moods.length,
    repeated_openings: repeatedOpenings,
    repeated_openings_count: repeatedOpenings.reduce((n, r) => n + r.count, 0),
    repeated_opening_groups: repeatedOpenings.length,
    with_a_rhythm_count: rhythm,
    generic_wording_flags: generic,
    stock_opening_flags: stock,
    adjective_pair_opening_count: adjPair,
    ornamental_wording_flags: ornamental,
    near_duplicate_structure_pairs: nearDupPairs,
    interchangeable_mood_flags: interchangeable,
  };
}

/**
 * @param {object} film — title, year, synopsis, moods, technique, previous_the_mood
 * @param {object} guide
 * @param {string[]} [overused]
 */
export function buildMoodOnlyWriterPrompt(film, guide, overused = []) {
  const relevant = selectRelevantMoodExamples(guide, film.moods ?? [], 4);
  return `
You are the Resonale Content writer, mood-only mode.
Rewrite ONLY the_mood for this film using the Resonale Mood Writing Guide.
Do NOT change synopsis, technique, or moods tags.
Do NOT invent plot facts. Do NOT retell the synopsis.

${formatMoodWritingGuideForPrompt(guide)}

Relevant good examples for this emotional profile (do not copy):
${relevant
  .map((ex) => `- "${ex.the_mood ?? ex.text}"${ex.why ? ` — ${ex.why}` : ""}`)
  .join("\n") || "(none)"}

Overused constructions in this batch — avoid repeating them:
${overused.length ? overused.map((x) => `- ${x}`).join("\n") : "(none yet)"}

Film:
Title: ${film.title}
Year: ${film.year ?? ""}
Technique: ${JSON.stringify(film.technique ?? null)}
Synopsis (context only — do not paraphrase into mood):
${film.synopsis ?? ""}
Moods tags: ${JSON.stringify(film.moods ?? [])}
Previous the_mood (improve if weak/generic; keep if already strong and specific):
${film.previous_the_mood ?? film.the_mood ?? ""}

HARD LIMIT: the_mood must be at most ${EDITORIAL_COPY_LIMITS.the_mood} words (UI budget). Prefer 16–22.

Return ONLY JSON:
{
  "the_mood": "...",
  "unchanged": true | false,
  "principles_applied": ["short principle ids or phrases from the guide"],
  "note": "why kept or changed"
}
`.trim();
}

/**
 * @param {object} film
 * @param {object} draft — { the_mood, unchanged?, principles_applied?, note? }
 * @param {object} guide
 */
export function buildMoodOnlyReviewerPrompt(film, draft, guide) {
  return `
You are the Resonale lightweight reviewer for the_mood only.
Check the draft against the Mood Writing Guide.
Do NOT rewrite the text.

${formatMoodWritingGuideForPrompt(guide)}

Film: ${film.title} (${film.year ?? ""})
Synopsis: ${film.synopsis ?? ""}
Moods tags: ${JSON.stringify(film.moods ?? [])}
Previous the_mood: ${film.previous_the_mood ?? ""}
New the_mood: ${draft.the_mood}
Writer note: ${draft.note ?? ""}

FIX only if:
- clearly generic / interchangeable across unrelated films
- unnatural English
- repeats synopsis
- unconfirmed factual claim
- near-verbatim copy of a guide example
- clearly violates the guide
- the sentence could describe many unrelated films unchanged

PASS_WITH_NOTE if:
- mild template feel
- a repeated word
- a stronger version exists but current is usable

PASS if solid.

Return ONLY JSON:
{
  "verdict": "PASS" | "PASS_WITH_NOTE" | "FIX",
  "notes": ["..."],
  "issues": [{"code":"...","detail":"..."}],
  "summary": "one short sentence"
}
`.trim();
}

/**
 * @param {object} film
 * @param {{
 *   openai: { chat: { completions: { create: Function } } },
 *   guide?: object | null,
 *   model?: string,
 *   overused?: string[],
 *   writerFn?: Function,
 *   reviewerFn?: Function,
 * }} options
 */
export async function rewriteMoodForFilm(film, options = {}) {
  const guide = options.guide ?? loadMoodWritingGuide();
  if (!guide) {
    throw new Error("Mood Writing Guide not found — generate it first");
  }
  const model = options.model ?? "gpt-4.1-mini";
  const overused = options.overused ?? [];

  async function defaultChat(prompt) {
    const response = await options.openai.chat.completions.create({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: prompt },
      ],
    });
    return parseJsonFromModelText(response.choices?.[0]?.message?.content);
  }

  const writerFn =
    options.writerFn ??
    ((row) => defaultChat(buildMoodOnlyWriterPrompt(row, guide, overused)));
  const reviewerFn =
    options.reviewerFn ??
    ((row, draft) => defaultChat(buildMoodOnlyReviewerPrompt(row, draft, guide)));

  const previous = cleanupEditorialField(
    film.previous_the_mood ?? film.the_mood ?? ""
  );
  const written = await writerFn(film);
  let theMood = cleanupEditorialField(written?.the_mood ?? "");
  let unchanged = Boolean(written?.unchanged) || theMood === previous;
  let principles = Array.isArray(written?.principles_applied)
    ? written.principles_applied
    : [];
  let writerNote = written?.note ?? null;

  const validation = validateMoodOnly(theMood, film.synopsis ?? "");
  if ((validation.issues.length || !theMood) && options.openai && !options.skipFixRevision) {
    const wordIssue = validation.issues.find((issue) => /exceeds|words/i.test(issue));
    const retryPrompt =
      buildMoodOnlyWriterPrompt(film, guide, overused) +
      `\n\nYour previous draft failed validation:\n${validation.issues.join("\n")}\n` +
      (wordIssue
        ? `\nRewrite in ${EDITORIAL_COPY_LIMITS.the_mood} words or fewer. Current word count: ${countWords(theMood)}.`
        : "\nFix the issues and return JSON again.");
    const retried = await defaultChat(retryPrompt);
    const retriedMood = cleanupEditorialField(retried?.the_mood ?? "");
    const reval = validateMoodOnly(retriedMood, film.synopsis ?? "");
    if (retriedMood && !reval.issues.length) {
      theMood = reval.the_mood || retriedMood;
      unchanged = theMood === previous;
      principles = Array.isArray(retried?.principles_applied)
        ? retried.principles_applied
        : principles;
      writerNote = retried?.note ?? writerNote;
    } else {
      theMood = previous;
      unchanged = true;
      writerNote = `validation_failed_kept_previous: ${validation.issues.join("; ")}`;
    }
  } else if (validation.issues.length || !theMood) {
    theMood = previous;
    unchanged = true;
    writerNote = `validation_failed_kept_previous: ${validation.issues.join("; ")}`;
  } else {
    theMood = validation.the_mood || theMood;
  }

  let review = await reviewerFn(film, {
    the_mood: theMood,
    unchanged,
    principles_applied: principles,
    note: writerNote,
  });

  let verdict = String(review?.verdict ?? "PASS").toUpperCase();
  if (verdict === "REVISE") verdict = "FIX";

  // One FIX revision for mood only
  if (verdict === "FIX" && options.openai && !options.skipFixRevision) {
    const fixNote = (review?.issues ?? [])
      .map((issue) => issue.detail ?? issue.code)
      .join("; ");
    const revised = await defaultChat(
      buildMoodOnlyWriterPrompt(
        {
          ...film,
          previous_the_mood: theMood,
        },
        guide,
        overused
      ) + `\n\nReviewer FIX required: ${fixNote}\nReturn a corrected the_mood.`
    );
    const revisedMood = cleanupEditorialField(revised?.the_mood ?? "");
    const reval = validateMoodOnly(revisedMood, film.synopsis ?? "");
    if (revisedMood && !reval.issues.length) {
      theMood = reval.the_mood || revisedMood;
      unchanged = theMood === previous;
      principles = Array.isArray(revised?.principles_applied)
        ? revised.principles_applied
        : principles;
      writerNote = revised?.note ?? writerNote;
      review = await reviewerFn(film, {
        the_mood: theMood,
        unchanged,
        principles_applied: principles,
        note: writerNote,
      });
      verdict = String(review?.verdict ?? "PASS").toUpperCase();
      if (verdict === "REVISE") verdict = "FIX";
    }
  }

  return {
    title: film.title,
    id: film.id ?? null,
    previous_the_mood: previous,
    new_the_mood: theMood,
    unchanged,
    guide_version: guide.version ?? MOOD_GUIDE_ID,
    principles_applied: principles,
    reviewer_verdict: verdict,
    reviewer_notes: review?.notes ?? [],
    reviewer_issues: review?.issues ?? [],
    reviewer_summary: review?.summary ?? null,
    writer_note: writerNote,
    synopsis_unchanged: true,
    technique_unchanged: true,
    moods_unchanged: true,
    writes_to_films_table: false,
    databaseMutated: false,
    email_sent: false,
  };
}

/**
 * @param {object[]} films
 * @param {object} options
 */
export async function runMoodOnlyComparisonBatch(films, options = {}) {
  const guide = options.guide ?? loadMoodWritingGuide();
  const results = [];
  /** @type {string[]} */
  const overused = [];

  const beforeMetrics = measureMoodBatchMetrics(
    films.map((f) => ({ the_mood: f.previous_the_mood ?? f.the_mood }))
  );

  for (const film of films) {
    const row = await rewriteMoodForFilm(
      { ...film, previous_the_mood: film.previous_the_mood ?? film.the_mood },
      { ...options, guide, overused }
    );
    results.push(row);

    const flags = flagMoodPatterns(row.new_the_mood);
    if (flags.has_stock_opening || flags.has_with_a_rhythm) {
      const key = flags.opening;
      const count = results.filter(
        (r) => moodOpeningKey(r.new_the_mood) === key
      ).length;
      if (count >= 2 && !overused.includes(key)) overused.push(key);
    }
  }

  const afterMetrics = measureMoodBatchMetrics(
    results.map((r) => ({ the_mood: r.new_the_mood }))
  );

  let pass = 0;
  let passNote = 0;
  let fix = 0;
  let unchanged = 0;
  let regenerated = 0;
  for (const row of results) {
    const v = row.reviewer_verdict;
    if (v === "PASS") pass += 1;
    else if (v === "PASS_WITH_NOTE") passNote += 1;
    else if (v === "FIX") fix += 1;
    if (row.unchanged) unchanged += 1;
    else regenerated += 1;
  }

  return {
    guide_version: guide?.version ?? MOOD_GUIDE_ID,
    results,
    metrics: {
      total: results.length,
      unchanged_good_moods: unchanged,
      regenerated_moods: regenerated,
      reviewer_pass: pass,
      reviewer_pass_with_note: passNote,
      reviewer_fix: fix,
      repeated_openings_before: beforeMetrics.repeated_opening_groups,
      repeated_openings_after: afterMetrics.repeated_opening_groups,
      repeated_openings_before_detail: beforeMetrics.repeated_openings,
      repeated_openings_after_detail: afterMetrics.repeated_openings,
      with_a_rhythm_before: beforeMetrics.with_a_rhythm_count,
      with_a_rhythm_after: afterMetrics.with_a_rhythm_count,
      interchangeable_mood_flags_before: beforeMetrics.interchangeable_mood_flags,
      interchangeable_mood_flags_after: afterMetrics.interchangeable_mood_flags,
      near_duplicate_structures_before:
        beforeMetrics.near_duplicate_structure_pairs,
      near_duplicate_structures_after: afterMetrics.near_duplicate_structure_pairs,
      generic_wording_flags_before: beforeMetrics.generic_wording_flags,
      generic_wording_flags_after: afterMetrics.generic_wording_flags,
      adjective_pair_opening_before: beforeMetrics.adjective_pair_opening_count,
      adjective_pair_opening_after: afterMetrics.adjective_pair_opening_count,
      ornamental_wording_flags_before: beforeMetrics.ornamental_wording_flags,
      ornamental_wording_flags_after: afterMetrics.ornamental_wording_flags,
      databaseMutated: false,
      writes_to_films_table: false,
      email_sent: false,
    },
  };
}
