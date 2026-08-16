/**
 * Live-action Visual World tags — spatial/visual character of the film world.
 * Independent of mood and of filmmaking technique / material aesthetics.
 */

export const VISUAL_WORLD_TAGS_MIN = 2;
export const VISUAL_WORLD_TAGS_MAX = 5;

/** Controlled starter vocabulary (visual character + spatial character). */
export const VISUAL_WORLD_VOCABULARY = Object.freeze([
  // Visual character
  "luminous",
  "sunlit",
  "warm",
  "cold",
  "muted",
  "lush",
  "stark",
  "soft",
  "high-contrast",
  "polished",
  "raw",
  "tactile",
  "naturalistic",
  "stylized",
  "rugged",
  "hazy",
  "desaturated",
  "saturated",
  // Spatial character
  "open",
  "vast",
  "enclosed",
  "intimate",
  "urban",
  "rural",
  "coastal",
  "mountainous",
  "forested",
  "desert",
  "interiors-focused",
  "domestic",
  "industrial",
]);

const VOCAB_SET = new Set(
  VISUAL_WORLD_VOCABULARY.map((tag) => tag.toLowerCase())
);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeVisualWorldTags(value) {
  const raw = Array.isArray(value) ? value : [];
  const cleaned = raw
    .map((tag) =>
      String(tag ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
    )
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, VISUAL_WORLD_TAGS_MAX);
}

/**
 * Keep controlled vocabulary only; collect off-vocab proposals for review.
 * @param {unknown} value
 * @returns {{ tags: string[], offVocabulary: string[] }}
 */
export function normalizeVisualWorldTagsPreferVocabulary(value) {
  const all = normalizeVisualWorldTags(value);
  const tags = all.filter((tag) => VOCAB_SET.has(tag));
  const offVocabulary = all.filter((tag) => !VOCAB_SET.has(tag));
  return { tags, offVocabulary };
}

export function buildVisualWorldTagsPromptSection() {
  const vocab = VISUAL_WORLD_VOCABULARY.join(", ");
  return `
VISUAL WORLD tags (visual_world_tags) — live-action only:
Describe how the film's world looks and feels spatially / visually: light, color temperature,
texture of the image world, openness of space, natural vs urban setting, degree of stylization.
This is NOT mood (do not use tender, melancholic, hopeful, tense, etc.).
This is NOT filmmaking technique (do not use handheld, long take, steadicam, 35mm, etc.).
This is NOT production material aesthetics from animation (handmade, puppet-like, clay-like).
Prefer 2–${VISUAL_WORLD_TAGS_MAX} truly characteristic tags from this vocabulary only:
${vocab}
If a needed concept is missing from the vocabulary, do NOT invent a production tag —
put it in suggested_visual_world_tags instead.
Do not assign tags for quantity; only distinctive ones.
`.trim();
}

/**
 * @param {object} film
 */
export function buildVisualWorldTagsOnlyPrompt(film) {
  return `
You are tagging live-action feature films for a taste recommendation system.

We already have emotional MOOD tags. Now generate VISUAL WORLD tags only.

Three independent layers (do not conflate):
1) MOODS — what the film makes you feel / emotional temperature.
2) VISUAL WORLD — how the film's world looks and feels spatially (this task).
3) STORYTELLING — how the film organizes and delivers the story (not this task).

${buildVisualWorldTagsPromptSection()}

Film:
Title: ${film.title ?? ""}
Original title: ${film.original_title ?? ""}
Year: ${film.year ?? ""}
Director: ${film.director ?? ""}
Country: ${film.country ?? ""}
Synopsis: ${film.synopsis ?? ""}
The mood sentence: ${film.the_mood ?? ""}
Moods (do not copy): ${(film.moods ?? []).join(", ")}
Existing aesthetic/material tags (legacy; do not copy as visual world): ${(film.aesthetic_tags ?? []).join(", ")}

Return only JSON:
{
  "visual_world_tags": ["...", "..."],
  "suggested_visual_world_tags": []
}
`.trim();
}
