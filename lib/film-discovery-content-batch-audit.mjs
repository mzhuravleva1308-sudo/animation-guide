/**
 * Batch-level editorial notes for discovery content drafts.
 * Notes only — never triggers revision or status changes.
 */

import { composeContentNote } from "./film-discovery-content-note.mjs";

const GENERIC_WORDS =
  /\b(quirky|reflective|dreamlike|vivid|powerful|surreal|whimsical|distinctive)\b/i;

const WEAK_MOOD_OPENINGS = [
  "fast-paced and",
  "dark and",
  "quiet and",
  "tense and",
  "darkly comic",
];

/**
 * @param {string} text
 * @param {number} n
 */
function openingNGrams(text, n = 2) {
  const words = String(text ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < n) return words.join(" ");
  return words.slice(0, n).join(" ");
}

/**
 * @param {object[]} results
 */
export function analyzeBatchEditorialPatterns(results) {
  const rows = (results ?? []).filter(
    (row) => !row.skipped && row.synopsis && row.the_mood
  );

  /** @type {Record<string, string[]>} */
  const moodOpenings = {};
  /** @type {Record<string, string[]>} */
  const synopsisOpenings = {};
  /** @type {object[]} */
  const genericFlags = [];

  for (const row of rows) {
    const moodOpen = openingNGrams(row.the_mood, 2);
    const synOpen = openingNGrams(row.synopsis, 2);
    (moodOpenings[moodOpen] ??= []).push(row.title);
    (synopsisOpenings[synOpen] ??= []).push(row.title);

    if (GENERIC_WORDS.test(row.the_mood) || GENERIC_WORDS.test(row.synopsis)) {
      genericFlags.push({
        title: row.title,
        id: row.id,
        fields: [
          ...(GENERIC_WORDS.test(row.synopsis) ? ["synopsis"] : []),
          ...(GENERIC_WORDS.test(row.the_mood) ? ["the_mood"] : []),
        ],
      });
    }
  }

  const repeatedMoodOpenings = Object.entries(moodOpenings)
    .filter(([, titles]) => titles.length >= 3)
    .map(([opening, titles]) => ({ opening, count: titles.length, titles }));

  const repeatedSynopsisOpenings = Object.entries(synopsisOpenings)
    .filter(([, titles]) => titles.length >= 3)
    .map(([opening, titles]) => ({ opening, count: titles.length, titles }));

  /** @type {object[]} */
  const batchNotes = [];
  for (const group of repeatedMoodOpenings) {
    batchNotes.push({
      type: "repeated_mood_opening",
      opening: group.opening,
      count: group.count,
      titles: group.titles,
      note: `Mood opening "${group.opening}" repeats across ${group.count} films in this batch.`,
    });
  }
  for (const group of repeatedSynopsisOpenings) {
    batchNotes.push({
      type: "repeated_synopsis_opening",
      opening: group.opening,
      count: group.count,
      titles: group.titles,
      note: `Synopsis opening "${group.opening}" repeats across ${group.count} films in this batch.`,
    });
  }
  if (genericFlags.length >= 3) {
    batchNotes.push({
      type: "generic_wording",
      count: genericFlags.length,
      titles: genericFlags.map((row) => row.title),
      note: `${genericFlags.length} cards use generic wording (quirky/dreamlike/reflective/etc.).`,
    });
  }

  return {
    repeated_mood_openings: repeatedMoodOpenings,
    repeated_synopsis_openings: repeatedSynopsisOpenings,
    generic_wording_flags: genericFlags.length,
    generic_wording_details: genericFlags,
    batch_notes: batchNotes,
    // Legacy field kept empty — batch never requests revision now.
    revision_targets: [],
  };
}

/**
 * Attach batch notes only; do not revise or change content_status.
 * @param {object[]} results
 */
export async function applyBatchEditorialAudit(results) {
  const analysis = analyzeBatchEditorialPatterns(results);
  const noteByTitle = new Map();
  for (const note of analysis.batch_notes) {
    for (const title of note.titles ?? []) {
      const list = noteByTitle.get(title) ?? [];
      list.push(note.note);
      noteByTitle.set(title, list);
    }
  }

  for (const row of results) {
    if (row.skipped) continue;
    const notes = noteByTitle.get(row.title);
    if (!notes?.length) continue;
    row.diagnostics = {
      ...(row.diagnostics ?? {}),
      batch_audit_notes: notes,
    };
    row.content_note = composeContentNote([row.content_note, ...notes].filter(Boolean));
    if (row.content_status === "ready" || row.content_status === "content_ready") {
      row.content_status = "ready_with_note";
    }
  }

  return {
    results,
    analysis,
    tallies: {
      repeated_mood_openings: analysis.repeated_mood_openings.length,
      repeated_synopsis_openings: analysis.repeated_synopsis_openings.length,
      generic_wording_flags: analysis.generic_wording_flags,
      generic_wording_batch_notes: analysis.batch_notes.filter(
        (note) => note.type === "generic_wording"
      ).length,
      batch_revision_requests: 0,
      batch_needs_review_after_revision_limit: 0,
      batch_notes: analysis.batch_notes.length,
    },
  };
}
