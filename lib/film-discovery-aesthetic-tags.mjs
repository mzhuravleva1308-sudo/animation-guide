/**
 * Aesthetic / material feeling tags for discovery content.
 * Same job as scripts/fill-aesthetic-tags.mjs, shared for curator + backfill.
 */

export const AESTHETIC_TAGS_MAX = 7;
export const AESTHETIC_TAGS_MIN = 4;

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeAestheticTags(value) {
  const raw = Array.isArray(value) ? value : [];
  const cleaned = raw
    .map((tag) => String(tag ?? "").trim().toLowerCase())
    .filter(Boolean)
    .filter((tag) => tag.split(/\s+/).length <= 4);
  return [...new Set(cleaned)].slice(0, AESTHETIC_TAGS_MAX);
}

/**
 * Prompt block for Content curator / standalone aesthetic tag generation.
 * @param {{
 *   title?: string,
 *   original_title?: string | null,
 *   year?: number | null,
 *   directors?: string[],
 *   countries?: string[],
 *   technique?: string | null,
 *   moods?: string[] | null,
 *   synopsis?: string | null,
 *   the_mood?: string | null,
 * }} film
 */
export function buildAestheticTagsPromptSection(film) {
  return `
AESTHETIC / MATERIAL tags (aesthetic_tags):
Describe how the animated world feels visually, materially, texturally, sensorially.
Do NOT repeat pure emotional moods (sad, tender, melancholic, hopeful).
Do NOT use plain technique labels alone (2D animation, stop-motion) unless transformed into a felt quality (puppet-like, sketch-like, clay-like).
Prefer tags like: handmade, tactile, puppet-like, miniature world, paper-cut feeling, storybook-like, ornamental, fluid, elemental, organic, polished handmade, sketch-like, clay-like, flat decorative world, soft grotesque, lush hand-drawn world, cold vastness, rough texture, delicate macabre.
Return ${AESTHETIC_TAGS_MIN}–${AESTHETIC_TAGS_MAX} lowercase tags, 1–4 words each, no duplicates.
`.trim();
}

/**
 * Standalone user prompt for aesthetic-tag-only generation.
 * @param {object} film
 */
export function buildAestheticTagsOnlyPrompt(film) {
  return `
You are tagging animated feature films for an animation taste recommendation system.

We already have emotional mood tags. Now generate AESTHETIC / MATERIAL FEELING tags.

${buildAestheticTagsPromptSection(film)}

Film:
Title: ${film.title ?? ""}
Original title: ${film.original_title ?? ""}
Year: ${film.year ?? ""}
Directors: ${(film.directors ?? []).join(", ")}
Countries: ${(film.countries ?? []).join(", ")}
Technique: ${film.technique ?? ""}
Moods: ${(film.moods ?? []).join(", ")}
Synopsis: ${film.synopsis ?? ""}
The mood: ${film.the_mood ?? ""}

Return only JSON:
{
  "aesthetic_tags": ["...", "..."]
}
`.trim();
}
