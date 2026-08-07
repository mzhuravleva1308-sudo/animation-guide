/**
 * Short human-facing content_note for manual discovery review.
 */

/**
 * @param {string[]} notes
 */
export function composeContentNote(notes) {
  const raw = (notes ?? []).map((n) => String(n).trim()).filter(Boolean);
  if (!raw.length) return null;

  /** @type {string[]} */
  const mapped = [];
  const pushUnique = (text) => {
    if (text && !mapped.includes(text)) mapped.push(text);
  };

  for (const note of raw) {
    if (/TMDB|overview/i.test(note) && /synopsis|close|heavy|match/i.test(note)) {
      pushUnique("Synopsis based mainly on TMDB overview.");
      continue;
    }
    if (/rotoscope/i.test(note)) {
      pushUnique("Possible rotoscope; verify before approval.");
      continue;
    }
    if (
      /secondary source|Technique labels lack|lacks a direct|without official|verify during manual/i.test(
        note
      )
    ) {
      pushUnique("Technique based on secondary source.");
      continue;
    }
    if (
      /technique missing|could not be determined|Technique classification|not confirmed/i.test(
        note
      )
    ) {
      pushUnique("Technique could not be determined.");
      continue;
    }
    if (
      /generic|quirky|dreamlike|reflective|stock connective|X and …|common 'X and/i.test(
        note
      )
    ) {
      pushUnique("Mood wording is somewhat generic.");
      continue;
    }
    if (/batch|Mood opening|Synopsis opening|cards use generic/i.test(note)) {
      pushUnique("Batch wording overlap; check nearby cards.");
      continue;
    }
    if (note.length <= 120 && !/^technique:/i.test(note)) {
      pushUnique(note.replace(/\s+/g, " ").trim());
      continue;
    }
    if (/^technique:/i.test(note)) {
      pushUnique("Technique based on secondary source.");
      continue;
    }
  }

  if (!mapped.length) {
    pushUnique("Needs manual editorial check.");
  }

  return mapped.slice(0, 4).join(" ");
}
