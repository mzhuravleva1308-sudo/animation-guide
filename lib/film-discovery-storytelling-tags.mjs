/**
 * Live-action Storytelling tags — how the film organizes and delivers story.
 * Independent of mood, genre, and visual world.
 */

export const STORYTELLING_TAGS_MIN = 2;
export const STORYTELLING_TAGS_MAX = 5;

/** Controlled starter vocabulary. */
export const STORYTELLING_VOCABULARY = Object.freeze([
  "clear narrative",
  "plot-driven",
  "character-driven",
  "observational",
  "slow-burn",
  "episodic",
  "loose",
  "ambiguous",
  "fragmented",
  "nonlinear",
  "minimal plot",
  "dialogue-driven",
  "experiential",
  "experimental",
  "elliptical",
  "linear",
  "ensemble",
]);

const VOCAB_SET = new Set(
  STORYTELLING_VOCABULARY.map((tag) => tag.toLowerCase())
);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeStorytellingTags(value) {
  const raw = Array.isArray(value) ? value : [];
  const cleaned = raw
    .map((tag) =>
      String(tag ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
    )
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, STORYTELLING_TAGS_MAX);
}

/**
 * Keep controlled vocabulary only; collect off-vocab proposals for review.
 * @param {unknown} value
 * @returns {{ tags: string[], offVocabulary: string[] }}
 */
export function normalizeStorytellingTagsPreferVocabulary(value) {
  const all = normalizeStorytellingTags(value);
  const tags = all.filter((tag) => VOCAB_SET.has(tag));
  const offVocabulary = all.filter((tag) => !VOCAB_SET.has(tag));
  return { tags, offVocabulary };
}

export function buildStorytellingTagsPromptSection() {
  const vocab = STORYTELLING_VOCABULARY.join(", ");
  return `
STORYTELLING tags (storytelling_tags) — live-action only:
Describe how the film organizes and delivers the story to the viewer:
narrative clarity, plot vs character orientation, linearity, observational/episodic structure,
ambiguity, experimentation, dialogue density, experiential pacing.
This is NOT mood.
This is NOT genre (romance, thriller, comedy, etc.).
This is NOT visual world / lighting / space.
Important distinctions:
- slow-burn does NOT automatically mean ambiguous;
- a clear slow story differs from a slow experimental film;
- character-driven does not imply loose or fragmented.
Prefer 2–${STORYTELLING_TAGS_MAX} truly characteristic tags from this vocabulary only:
${vocab}
If a needed concept is missing, do NOT invent a production tag —
put it in suggested_storytelling_tags instead.
Do not assign tags for quantity; only distinctive ones.
`.trim();
}

/**
 * @param {object} film
 */
export function buildStorytellingTagsOnlyPrompt(film) {
  return `
You are tagging live-action feature films for a taste recommendation system.

We already have emotional MOOD tags. Now generate STORYTELLING tags only.

Three independent layers (do not conflate):
1) MOODS — what the film makes you feel / emotional temperature.
2) VISUAL WORLD — how the film's world looks and feels spatially (not this task).
3) STORYTELLING — how the film organizes and delivers the story (this task).

${buildStorytellingTagsPromptSection()}

Film:
Title: ${film.title ?? ""}
Original title: ${film.original_title ?? ""}
Year: ${film.year ?? ""}
Director: ${film.director ?? ""}
Country: ${film.country ?? ""}
Synopsis: ${film.synopsis ?? ""}
The mood sentence: ${film.the_mood ?? ""}
Moods (do not copy): ${(film.moods ?? []).join(", ")}
Visual world tags if any (do not copy): ${(film.visual_world_tags ?? []).join(", ")}

Return only JSON:
{
  "storytelling_tags": ["...", "..."],
  "suggested_storytelling_tags": []
}
`.trim();
}
