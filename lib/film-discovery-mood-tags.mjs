/**
 * Emotional mood tags for discovery content.
 * Same job as scripts/fill-emotional-tags.mjs (catalog AI style).
 */

import { CATALOG_MOOD_TAG_VOCABULARY } from "./film-discovery-content-style-guide.mjs";

export const MOOD_TAGS_MIN = 4;
export const MOOD_TAGS_MAX = 7;

const CATALOG_MOOD_SET = new Set(
  CATALOG_MOOD_TAG_VOCABULARY.map((tag) => tag.toLowerCase())
);

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeDiscoveryMoodTags(value) {
  const raw = Array.isArray(value) ? value : [];
  const cleaned = raw
    .map((tag) =>
      String(tag ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
    )
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, MOOD_TAGS_MAX);
}

/**
 * Soft-filter to catalog vocabulary when possible; keep extras if under-filled.
 * @param {unknown} value
 * @returns {{ moods: string[], offVocabulary: string[] }}
 */
export function normalizeDiscoveryMoodTagsPreferCatalog(value) {
  const all = normalizeDiscoveryMoodTags(value);
  const inVocab = all.filter((tag) => CATALOG_MOOD_SET.has(tag));
  const offVocabulary = all.filter((tag) => !CATALOG_MOOD_SET.has(tag));
  const moods =
    inVocab.length >= MOOD_TAGS_MIN
      ? inVocab.slice(0, MOOD_TAGS_MAX)
      : all.slice(0, MOOD_TAGS_MAX);
  return { moods, offVocabulary };
}

/**
 * Prompt block for Content curator — AI catalog emotional style.
 */
export function buildMoodTagsPromptSection() {
  const vocabHint = CATALOG_MOOD_TAG_VOCABULARY.slice(0, 28).join(", ");
  return `
EMOTIONAL mood tags (moods) — AI catalog style (same as fill-emotional-tags):
Describe how the film feels emotionally / psychologically (not visually).
Return ${MOOD_TAGS_MIN}–${MOOD_TAGS_MAX} lowercase tags.
Prefer catalog vocabulary: ${vocabHint}, …
Do NOT include visual/material/aesthetic/technique tags (tactile, handmade, painterly, stop-motion, etc.).
Do NOT use non-emotional themes (historical, friendship, war, family as topic).
Sensory-emotional is OK (eerie, claustrophobic, dreamlike); material is not.
`.trim();
}

/**
 * Standalone user prompt for mood-tag-only generation.
 * @param {object} film
 */
export function buildMoodTagsOnlyPrompt(film) {
  return `
You are tagging animated films for a personal recommendation system.

Generate ${MOOD_TAGS_MIN} to ${MOOD_TAGS_MAX} emotional / sensory mood tags for this animated film.

${buildMoodTagsPromptSection()}

Film:
Title: ${film.title ?? ""}
Original title: ${film.original_title ?? ""}
Year: ${film.year ?? ""}
Directors: ${(film.directors ?? []).join(", ")}
Countries: ${(film.countries ?? []).join(", ")}
Synopsis: ${film.synopsis ?? ""}
Technique: ${film.technique ?? ""}
The mood: ${film.the_mood ?? ""}
Current moods: ${(film.moods ?? []).join(", ")}
Aesthetic tags to keep separate, do not copy into moods: ${(film.aesthetic_tags ?? []).join(", ")}

Return only JSON:
{
  "moods": ["...", "..."]
}
`.trim();
}
