/**
 * Resonale Content Style Guide for discovery Content curator + Content reviewer.
 *
 * Derived from hosted catalog analysis (catalog_visible films with synopsis +
 * the_mood + technique) and existing editorial rules in film-editorial-copy.mjs.
 * Both roles MUST import CONTENT_STYLE_GUIDE / CONTENT_STYLE_GUIDE_VERSION from
 * this module so they share one living standard.
 */

import {
  BANNED_MOOD_PHRASES,
  BANNED_PHRASES,
  EDITORIAL_COPY_LIMITS,
} from "./film-editorial-copy.mjs";

/** Bump when guide rules change — curator and reviewer prompts embed this. */
export const CONTENT_STYLE_GUIDE_VERSION = "resonale-content-style-v3";

/** Mood tags attested in hosted films.moods vocabulary (subset used for prompts). */
export const CATALOG_MOOD_TAG_VOCABULARY = Object.freeze([
  "absurd",
  "anxious",
  "bittersweet",
  "bleak",
  "chaotic",
  "dark",
  "dreamy",
  "eerie",
  "energetic",
  "gentle",
  "grotesque",
  "haunting",
  "hopeful",
  "intense",
  "intimate",
  "ironic",
  "light",
  "lighthearted",
  "lonely",
  "lyrical",
  "meditative",
  "melancholic",
  "mysterious",
  "nostalgic",
  "playful",
  "poetic",
  "quiet",
  "quirky",
  "reflective",
  "restless",
  "sad",
  "strange",
  "surreal",
  "tender",
  "tense",
  "thoughtful",
  "unsettling",
  "warm",
  "whimsical",
  "witty",
  "wry",
]);

/**
 * Soft length targets from hosted catalog (214 films with all three fields):
 * synopsis words p25–p75 ≈ 16–21 (max observed 38)
 * the_mood words p50–p75 ≈ 20–21 (editorial hard max 22)
 */
export const CONTENT_LENGTH = Object.freeze({
  synopsisMinWords: 12,
  synopsisTargetMaxWords: 28,
  synopsisHardMaxWords: 38,
  theMoodMaxWords: EDITORIAL_COPY_LIMITS.the_mood,
  techniqueMaxLabels: 2,
});

/**
 * Compact anonymized exemplars distilled from strong catalog entries.
 * Do not copy these verbatim into new films.
 */
export const CONTENT_STYLE_EXAMPLES = Object.freeze([
  {
    kind: "stop_motion_feature",
    technique: "stop motion, puppet animation",
    synopsis:
      "After a fatal accident, a feisty mouse and a shy fox cub meet in animal heaven, where predator and prey must learn to trust each other on a journey toward rebirth.",
    the_mood:
      "Tender and bittersweet, with puppet textures and an afterlife world that holds room for grief, fear, and renewed courage.",
  },
  {
    kind: "classic_surreal_2d",
    technique: "cut-out animation, surreal 2D",
    synopsis:
      "On a distant planet, tiny human-like Oms live under the control of giant blue Draags until some begin to resist their place in the world.",
    the_mood:
      "Surreal and unsettling, with stark color and an oppressive scale that keeps tension close to the surface.",
  },
  {
    kind: "animated_documentary",
    technique: "animated documentary",
    synopsis:
      "A playful animated documentary about a bizarre medical entrepreneur and the slippery nature of truth.",
    the_mood:
      "Breezy and irreverent, with absurdity and dark humor layered over stylized animation.",
  },
  {
    kind: "rotoscope_political",
    technique: "Rotoscope",
    synopsis:
      "A family continues to seek recognition for a missing journalist whose disappearance is tied to a mass killing.",
    the_mood:
      "Sober, intimate and unresolved, using rotoscoped memory to hold grief and a refusal to let one life disappear.",
  },
  {
    kind: "anime_night_odyssey",
    technique: "2D animation / anime",
    synopsis:
      "A young woman moves through a surreal night of drinking, books, theatre, coincidence, and romantic pursuit.",
    the_mood:
      "Energetic, surreal, and playful, with bright visual invention and a light strain of romantic tension.",
  },
]);

/** Weaker patterns observed or banned — do not emulate. */
export const CONTENT_ANTI_PATTERNS = Object.freeze([
  "Theme-essay synopsis that names topics instead of concrete story material (e.g. 'a delicate drama about guilt and friendship').",
  "Festival / trailer tone: visually stunning, powerful exploration, unique blend, tour de force.",
  "Mood that repeats the synopsis plot instead of pace, pressure, texture, warmth/coldness.",
  "Mood similes (like / as if) or decorative verbs (lingers, reveals).",
  "Technique labels that are genre or mood (horror, melancholic) rather than production method.",
  "Invented historical claims or awards without source support.",
]);

export const CONTENT_STYLE_GUIDE = Object.freeze({
  version: CONTENT_STYLE_GUIDE_VERSION,
  fields: {
    mainDescription: "synopsis",
    moodDescription: "the_mood",
    techniqueLabels: "technique",
    moodTags: "moods",
  },
  length: CONTENT_LENGTH,
  synopsis: {
    job: "Short neutral plot framing of THIS film — concrete characters, place, situation — without spoilers or evaluation.",
    voice: "Plain-spoken catalog note, not Wikipedia, press release, or LLM filler.",
    structure: "Usually one or two short sentences. Lead with situation, not abstract themes.",
    curatorialValue:
      "Prefer a clear situation. Include one concrete distinctive fact only when sources support it. Do not invent artistic interpretation.",
    avoid: [
      "Empty formulas: visually stunning journey, powerful exploration of, unique blend of",
      "Theme lists without story anchors",
      "Spoilers of endings, twists, deaths beyond setup already implied by premise",
      "Evaluative praise or ranking language",
      "Near-paraphrase of TMDB overview with no added curatorial specificity",
    ],
  },
  theMood: {
    job: "Felt viewing experience: pace, emotional pressure, humor, visual texture, warmth/coldness, noise/silence.",
    voice: "One compact sentence or fragment. Direct, not poetic simile.",
    dimensions:
      "Cover at least two of: emotional temperature; rhythm/intensity; sensory or atmospheric quality. Do not default to 'Fast-paced and…', 'Dark and…', or 'Quiet and…'.",
    mustNot: [
      "Plot recap",
      "Audience advice (perfect for…)",
      "Similes (like, as if, as though)",
      "Repeating the synopsis wording",
      "Automatic technique mention already shown as pills unless it changes the felt experience",
      "Bare quirky / dreamlike / reflective without concrete sense",
    ],
    maxWords: CONTENT_LENGTH.theMoodMaxWords,
  },
  technique: {
    job: "Production method labels that visibly characterize the film.",
    maxLabels: CONTENT_LENGTH.techniqueMaxLabels,
    storeAs: "Comma-separated text matching films.technique",
    displayNote: "FilmCard shows at most 2 pills.",
    evidenceRule:
      "Prefer production-method labels. Basic technique may be used with reasonable confidence from metadata. Put distinctive-technique doubts in technique_notes rather than blocking the card. Never use adult/independent/surreal/musical/digital animation as technique.",
    notTechnique: [
      "genre",
      "mood",
      "theme",
      "visual style adjectives alone",
      "adult animation",
      "independent animation",
      "surreal animation",
      "musical numbers",
      "digital animation without a more specific method",
    ],
  },
  moodsTags: {
    job: "Optional 4–7 lowercase emotional tags for later ranking (films.moods).",
    notShownOnCard: true,
    rules:
      "Prefer catalog vocabulary. Avoid near-synonym piles. Do not use technique or genre as mood tags.",
    vocabularyHint: CATALOG_MOOD_TAG_VOCABULARY.slice(0, 24).join(", ") + ", …",
  },
  examples: CONTENT_STYLE_EXAMPLES,
  antiPatterns: CONTENT_ANTI_PATTERNS,
  bannedPhraseSources: {
    shared: "BANNED_PHRASES from film-editorial-copy.mjs",
    mood: "BANNED_MOOD_PHRASES from film-editorial-copy.mjs",
  },
});

/**
 * Shared accessor — curator and reviewer must call this (not fork copies).
 * @returns {typeof CONTENT_STYLE_GUIDE}
 */
export function getContentStyleGuide() {
  return CONTENT_STYLE_GUIDE;
}

/**
 * Compact text block for LLM prompts.
 * @param {typeof CONTENT_STYLE_GUIDE} [guide]
 */
export function formatContentStyleGuideForPrompt(guide = CONTENT_STYLE_GUIDE) {
  const examples = guide.examples
    .map(
      (ex, index) =>
        `${index + 1}. [${ex.kind}] technique: ${ex.technique}\n` +
        `   synopsis: ${ex.synopsis}\n` +
        `   the_mood: ${ex.the_mood}`
    )
    .join("\n");

  return [
    `Content Style Guide version: ${guide.version}`,
    "",
    "SYNOPSIS (main description on film cards):",
    `- ${guide.synopsis.job}`,
    `- Voice: ${guide.synopsis.voice}`,
    `- Structure: ${guide.synopsis.structure}`,
    `- ${guide.synopsis.curatorialValue}`,
    `- Target length: ${guide.length.synopsisMinWords}–${guide.length.synopsisTargetMaxWords} words (hard max ${guide.length.synopsisHardMaxWords}).`,
    `- Avoid: ${guide.synopsis.avoid.join("; ")}`,
    "",
    "THE_MOOD (italic mood line on cards):",
    `- ${guide.theMood.job}`,
    `- ${guide.theMood.voice}`,
    `- ${guide.theMood.dimensions}`,
    `- Max ${guide.theMood.maxWords} words.`,
    `- Must not: ${guide.theMood.mustNot.join("; ")}`,
    "",
    "TECHNIQUE:",
    `- ${guide.technique.job}`,
    `- At most ${guide.technique.maxLabels} labels, comma-separated.`,
    `- ${guide.technique.evidenceRule}`,
    `- Not: ${guide.technique.notTechnique.join(", ")}.`,
    "",
    "MOODS tags (optional array, not shown on public card):",
    `- ${guide.moodsTags.job}`,
    `- ${guide.moodsTags.rules}`,
    `- Prefer tags such as: ${guide.moodsTags.vocabularyHint}`,
    "",
    "Anti-patterns:",
    ...guide.antiPatterns.map((line) => `- ${line}`),
    "",
    "Strong catalog-shaped examples (do not copy wording):",
    examples,
  ].join("\n");
}

export { BANNED_PHRASES, BANNED_MOOD_PHRASES };
