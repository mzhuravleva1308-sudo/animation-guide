/**
 * Aesthetic / material feeling tags for discovery content.
 * Same job as scripts/fill-aesthetic-tags.mjs (AI catalog style), shared for
 * curator + backfill. Prefer descriptive 2–4 word compounds over short canon
 * singles — ranking eval favored the hosted AI/catalog tag style.
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
AESTHETIC / MATERIAL tags (aesthetic_tags) — AI catalog style (same as fill-aesthetic-tags):
Describe how the animated world feels visually, materially, texturally, sensorially.
Do NOT repeat pure emotional moods (sad, tender, melancholic, hopeful).
Do NOT use plain technique labels alone (2D animation, stop-motion) unless transformed into a felt quality (puppet-like, clay-like texture).
Prefer film-specific 2–4 word compounds that distinguish neighbors in ranking, e.g.:
lush hand-drawn world, tactile textures, organic textures, storybook-like, dreamlike landscapes,
tactile warmth, hand-drawn warmth, puppet-like world, handcrafted world, vibrant color palette,
gritty realism, fluid brushstrokes, miniature world, soft grotesque, domestic grotesque,
delicate macabre, rough texture, cold vastness.
Avoid collapsing every film to bare singles like only "handmade" / "organic" / "tactile".
Return ${AESTHETIC_TAGS_MIN}–${AESTHETIC_TAGS_MAX} lowercase tags, preferably 2–4 words each, no duplicates.
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
