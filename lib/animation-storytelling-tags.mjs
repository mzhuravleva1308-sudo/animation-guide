/**
 * Animation Storytelling tags — how the animated film organizes and delivers story.
 * Independent of mood, genre, and visual / material style.
 * Richer controlled vocabulary than live-action storytelling tags.
 */

export const ANIMATION_STORYTELLING_TAGS_MIN = 4;
export const ANIMATION_STORYTELLING_TAGS_MAX = 7;

/** Controlled vocabulary for animated-film narrative mechanics. */
export const ANIMATION_STORYTELLING_VOCABULARY = Object.freeze([
  // Drive
  "quest-driven",
  "plot-driven",
  "character-driven",
  "mystery-driven",
  "adventure momentum",
  "fast-paced",
  "slow-burn",
  // Structure
  "linear",
  "episodic",
  "vignette structure",
  "nonlinear",
  "ensemble story",
  "caper structure",
  "fairy-tale structure",
  "folk-tale structure",
  "mythic tale",
  // Path / experience genre
  "road journey",
  "escape journey",
  "rescue mission",
  "survival journey",
  "transformation arc",
  "coming-of-age arc",
  "world discovery",
  "strange world discovery",
  "magical world discovery",
  // Story tone (not emotion)
  "quiet character study",
  "psychological portrait",
  "conversation-led",
  "relationship-driven",
  "observational story",
  "meditative journey",
  "atmospheric drift",
  "wordless journey",
  "symbolic journey",
  "philosophical fable",
  "satirical fable",
  "absurdist comedy",
  "surreal odyssey",
  // Plot density
  "clear narrative",
  "minimal plot",
  "simple story",
  "emotionally layered",
]);

const VOCAB_SET = new Set(
  ANIMATION_STORYTELLING_VOCABULARY.map((tag) => tag.toLowerCase())
);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeAnimationStorytellingTags(value) {
  const raw = Array.isArray(value) ? value : [];
  const cleaned = raw
    .map((tag) =>
      String(tag ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
    )
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, ANIMATION_STORYTELLING_TAGS_MAX);
}

/**
 * Keep controlled vocabulary only; collect off-vocab proposals for review.
 * @param {unknown} value
 * @returns {{ tags: string[], offVocabulary: string[] }}
 */
export function normalizeAnimationStorytellingTagsPreferVocabulary(value) {
  const all = normalizeAnimationStorytellingTags(value);
  const tags = all.filter((tag) => VOCAB_SET.has(tag));
  const offVocabulary = all.filter((tag) => !VOCAB_SET.has(tag));
  return { tags, offVocabulary };
}

export function buildAnimationStorytellingTagsPromptSection() {
  const vocab = ANIMATION_STORYTELLING_VOCABULARY.join(", ");
  return `
STORYTELLING tags (storytelling_tags) — animated films:
Describe how the film organizes and delivers the story to the viewer:
what kind of narrative journey it creates, how it holds attention,
plot vs character orientation, structure, path type, story density.

This is NOT mood (tender, melancholic, hopeful, eerie, warm, sad…).
This is NOT theme (family, friendship, ecology, grief, war, childhood…).
This is NOT visual / material style (handmade, painterly, stop-motion, colorful…).
This is NOT vague genre-only labels (drama, comedy, fantasy) unless they describe narrative mechanics.

How tags hold attention:
- quest-driven / plot-driven / adventure momentum: goals, events, "what happens next"
- character-driven / quiet character study / psychological portrait: inner conflict and change
- conversation-led / relationship-driven: dialogue and interpersonal dynamics
- world / strange / magical world discovery: exploring rules, places, creatures, hidden logic
- meditative / observational / atmospheric drift / wordless journey: presence, rhythm, observation over plot
- minimal plot / simple story: narratively thin even if visually or emotionally strong
- fairy-tale / folk-tale / mythic / fable tags: story-shape, not theme

Prefer ${ANIMATION_STORYTELLING_TAGS_MIN}–${ANIMATION_STORYTELLING_TAGS_MAX} distinctive tags from this vocabulary only:
${vocab}
If a needed concept is missing, do NOT invent a production tag —
put it in suggested_storytelling_tags instead.
`.trim();
}

/**
 * @param {object} film
 */
export function buildAnimationStorytellingTagsPrompt(film) {
  return `
You are tagging animated feature films for a taste recommendation system.

We already have emotional MOOD tags and aesthetic / material tags.
Now generate STORYTELLING tags only.

Three independent layers (do not conflate):
1) MOODS — what the film makes you feel / emotional temperature.
2) VISUAL / MATERIAL — how it looks and is crafted (not this task).
3) STORYTELLING — how the film organizes and delivers the story (this task).

${buildAnimationStorytellingTagsPromptSection()}

Film:
Title: ${film.title ?? ""}
Original title: ${film.original_title ?? ""}
Year: ${film.year ?? ""}
Director: ${film.director ?? ""}
Country: ${film.country ?? ""}
Technique: ${film.technique ?? ""}
Synopsis: ${film.synopsis ?? ""}
The mood sentence: ${film.the_mood ?? ""}
Moods (do not copy): ${(film.moods ?? []).join(", ")}
Aesthetic tags (do not copy): ${(film.aesthetic_tags ?? []).join(", ")}

Return only JSON:
{
  "storytelling_tags": ["...", "..."],
  "suggested_storytelling_tags": []
}
`.trim();
}
