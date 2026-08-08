/**
 * Resonale Content Style Guide for discovery Content curator + Content reviewer.
 *
 * Derived from hosted catalog analysis (catalog_visible films with synopsis +
 * the_mood + technique) and existing editorial rules in film-editorial-copy.mjs.
 * Both roles MUST import CONTENT_STYLE_GUIDE / CONTENT_STYLE_GUIDE_VERSION from
 * this module so they share one living standard.
 *
 * v5 incorporates editorial feedback on premise-first synopsis: establish the
 * central situation clearly and stop — no dramatic-arc summary, no trailer
 * stake-words as substitutes for concrete information.
 */

import {
  BANNED_MOOD_PHRASES,
  BANNED_PHRASES,
  EDITORIAL_COPY_LIMITS,
} from "./film-editorial-copy.mjs";

/** Bump when guide rules change — curator and reviewer prompts embed this. */
export const CONTENT_STYLE_GUIDE_VERSION = "resonale-content-style-v5";

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
 * Soft length targets: one-glance synopsis should stay compact.
 * Hard max unchanged (38). Target band tightened toward 12–22 words.
 */
export const CONTENT_LENGTH = Object.freeze({
  synopsisMinWords: 12,
  synopsisTargetMaxWords: 22,
  synopsisHardMaxWords: 38,
  theMoodMaxWords: EDITORIAL_COPY_LIMITS.the_mood,
  techniqueMaxLabels: 2,
});

/**
 * Strong premise-first exemplars (editorial gold).
 * Match the clarity and stop-point — do not copy wording into other films.
 */
export const CONTENT_STYLE_EXAMPLES = Object.freeze([
  {
    kind: "high_concept_trap",
    technique: "2D animation",
    synopsis:
      "A mackerel trapped in a restaurant aquarium tries to break free before becoming a meal.",
    the_mood:
      "Tense and claustrophobic under cold tank light, with bursts of frantic humor.",
  },
  {
    kind: "spy_animal_feature",
    technique: "2D animation",
    synopsis:
      "A retired mouse agent is recruited to retrieve secret plans that could stop a cat mafia’s extermination plot.",
    the_mood:
      "Brisk and cartoon-hard, with chase-energy under dry spy-parody humor.",
  },
  {
    kind: "dark_comedy_shop",
    technique: "2D animation",
    synopsis:
      "A family runs a shop selling suicide tools in a city where despair makes their business thrive.",
    the_mood:
      "Bitterly comic and gray, with cheerful storefront manners over a bleak city.",
  },
  {
    kind: "city_taxi_thread",
    technique: "2D animation",
    synopsis:
      "A taxi driver in rainy Naples carries passengers whose stories echo his brother’s mysterious disappearance.",
    the_mood:
      "Wet-night melancholy, soft and reflective between fares.",
  },
  {
    kind: "high_concept_body",
    technique: "2D animation",
    synopsis:
      "A selfish man wakes to find wings growing on his back that force him into unexpected acts of kindness.",
    the_mood:
      "Deadpan and slightly uncanny, with quiet humor in forced good deeds.",
  },
  {
    kind: "absurd_time_travel",
    technique: "2D animation",
    synopsis:
      "A young Romani man travels back to prehistoric times to hunt mammoths and trigger Hungary’s future oil wealth.",
    the_mood:
      "Chaotic and irreverent, with loud satire under the prehistoric gag.",
  },
  {
    kind: "kids_camping_threat",
    technique: "2D animation",
    synopsis:
      "Three 12-year-old boys join an older teen’s camping trip that turns eerie when a local monster legend appears real.",
    the_mood:
      "Playful then uneasy, with night-woods atmosphere under kid bravado.",
  },
  {
    kind: "gentle_slice_of_life",
    technique: "2D animation",
    synopsis:
      "Two friends share a simple life together in a forest cabin, exploring everyday moments in nature.",
    the_mood:
      "Soft and unhurried, with small woodland textures and quiet companionship.",
  },
  {
    kind: "reunion_past_violence",
    technique: "2D animation",
    synopsis:
      "Two former students reunite years later and revisit their shared history of school violence and its lasting impact.",
    the_mood:
      "Heavy and restrained, with cold recollection under adult quiet.",
  },
  {
    kind: "homecoming",
    technique: "2D animation",
    synopsis:
      "A Taiwanese woman returns to her family home after years abroad and reconnects with her childhood neighborhood.",
    the_mood:
      "Warm-nostalgic and gently restless, with neighborhood detail over big speeches.",
  },
]);

/**
 * Weak / wrong patterns from editorial review — do not emulate.
 * Prefer the paired stronger shape when rewriting.
 */
export const CONTENT_STYLE_WEAK_EXAMPLES = Object.freeze([
  {
    kind: "genre_tone_instead_of_premise",
    weak: "A glowing orb of ultimate evil confronts a young girl with vivid, unsettling stories blending dark fantasy and horror.",
    note: "Awkward visualization; tone/genre adjectives instead of structural premise (orb / girl / anthology stories).",
  },
  {
    kind: "trailer_intensity",
    weak: "A warrior in a frozen land pursues a kidnapped princess amid a villainous pair wielding destructive glaciers.",
    note: "Trailer words (villainous, destructive) and 'amid' blur a simple fantasy conflict.",
  },
  {
    kind: "drama_after_clear_premise",
    weak: "A ruthless assassin kidnaps a mafia witness, aiming to profit from a dangerous and volatile criminal standoff.",
    note: "Premise already clear after the kidnap; 'dangerous/volatile standoff' is empty escalation.",
  },
  {
    kind: "compressed_unclear_english",
    weak: "Two struggling actors in Los Angeles try to achieve fame before turning 30 amid a sensational crime breaking news.",
    note: "Unnatural English; fame quest + crime relationship unclear; generic 'try to achieve fame'.",
  },
  {
    kind: "extra_scare_adjectives",
    weak: "Last humans trapped in a mechanized world hide a cosmic embryo that terrifying creatures desperately seek to destroy.",
    note: "'terrifying/desperately' dramatize; strong premise already needs less intensity language.",
  },
  {
    kind: "next_plot_beat",
    weak: "A comic book punk escapes a mental wasteland to confront his creator after learning he will be killed off.",
    note: "Strong premise, but keeps adding the next causal beat; cleaner to stay inside the creator’s mind.",
  },
  {
    kind: "manufactured_stakes",
    weak: "A low-rent bounty hunter takes a dangerous job from a former biker turned U.S. senator with a deadly reputation.",
    note: "'dangerous/deadly' manufacture stakes; trust the concrete weird detail (biker senator).",
  },
  {
    kind: "topic_summary",
    weak: "Three women from different continents face losing their homes to climate change and must seek new places to live.",
    note: "Topic summary / abstract consequence; make the environmental situation more tangible, not more poetic.",
  },
  {
    kind: "vague_teaser_threat",
    weak: "An escaped convict returns to a remote Galician village to retrieve hidden treasure and encounters an unexpected local threat.",
    note: "'unexpected local threat' is trailer tease; if the threat cannot be named, stop before that phrase.",
  },
  {
    kind: "flattening_psychology",
    weak: "A young woman trapped on a decaying ship in future Naples tries to escape her controlling stepfamily.",
    note: "Mostly good; 'controlling' psychologizes a Cinderella beat — keep the distinctive setting, state family conflict simply.",
  },
]);

/** Weaker patterns observed or banned — do not emulate. */
export const CONTENT_ANTI_PATTERNS = Object.freeze([
  "Answering stakes / escalation / themes / emotional journey instead of the central situation.",
  "Theme-essay synopsis that names topics instead of concrete story material.",
  "Name-stack synopsis that forces the reader to remember two or more character names.",
  "Plot-chain / next-beat synopsis: then / after which / after learning / multi-beat journey.",
  "Drama-explanation after the premise is already clear (dangerous volatile standoff; when X threatens their plans).",
  "Trailer/logline stake-words used as filler: dangerous, deadly, volatile, unexpected threat, dark schemes, high-stakes, plans go awry.",
  "Generic verbs when a concrete situation exists: navigate, balance, juggle, face turmoil, confront challenges.",
  "Mood/genre language in synopsis (vivid unsettling; blending dark fantasy and horror) — that belongs in the_mood.",
  "Vague teaser withhold: 'an unexpected local threat', 'but something awaits'.",
  "Festival / press tone: visually stunning, powerful exploration, unique blend, tour de force.",
  "Mood that repeats the synopsis plot instead of pace, pressure, texture, warmth/coldness.",
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
    job: "Answer only: what is the central situation of this film? Who/what + concrete setup. Stop once the viewer can picture the basic premise.",
    voice: "Plain-spoken catalog note, not Wikipedia, press release, trailer logline, or LLM filler.",
    structure:
      "Prefer one sentence (two short clauses max). Premise + concrete situation + stop. Do not summarize the whole dramatic arc. Not every film needs a conflict hook — quiet premises may stay quiet (cabin life, homecoming).",
    oneGlanceTest:
      "After one line, a reader can picture the central situation — without memorizing names, a plot sequence, theme essay, or trailer stake-words.",
    curatorialValue:
      "Use roles/types. Prefer concrete nouns and actions. A strong strange premise usually needs LESS explanation, not more. Do not invent artistic interpretation.",
    doesNotAnswer: [
      "What are all the stakes?",
      "How does the conflict escalate?",
      "What themes does the film explore?",
      "Why is the story dramatic?",
      "What emotional journey will the character undergo?",
    ],
    avoid: [
      "Two or more proper character names the reader must track",
      "Event chains and next causal beats after the premise is clear",
      "Trailer stake-words as substitutes for concrete information: dangerous, deadly, volatile, unexpected threat, dark schemes, high-stakes",
      "Generic verbs when a concrete situation is available: navigate, balance, juggle, face turmoil, confront challenges",
      "Mood/genre coloring inside synopsis (belongs in the_mood)",
      "Vague teaser phrases: unexpected local threat, something awaits",
      "Empty formulas: visually stunning journey, powerful exploration of, unique blend of",
      "Theme lists without story anchors",
      "Spoilers of endings/twists beyond setup already implied by premise",
      "Evaluative praise or ranking language",
    ],
  },
  theMood: {
    job: "Felt viewing experience: pace, emotional pressure, humor, visual texture, warmth/coldness, noise/silence. Not the premise.",
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
      "Only store production-method labels supported by technique evidence. If evidence is missing or unconfirmed, leave technique empty and note uncertainty for manual review. Never invent 2D animation (or other basic technique) just because the film is animated. When a distinctive method is confirmed, do not also store a generic category. Never use adult/independent/surreal/musical/digital animation as technique.",
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
      "AI catalog style (same as fill-emotional-tags). Prefer catalog vocabulary. Avoid near-synonym piles. Do not use technique, genre, or material/aesthetic tags as mood tags.",
    vocabularyHint: CATALOG_MOOD_TAG_VOCABULARY.slice(0, 24).join(", ") + ", …",
  },
  examples: CONTENT_STYLE_EXAMPLES,
  weakExamples: CONTENT_STYLE_WEAK_EXAMPLES,
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
    .slice(0, 8)
    .map(
      (ex, index) =>
        `${index + 1}. [${ex.kind}]\n` + `   synopsis: ${ex.synopsis}`
    )
    .join("\n");

  const weak = (guide.weakExamples ?? [])
    .slice(0, 6)
    .map(
      (ex, index) =>
        `${index + 1}. WEAK [${ex.kind}]: ${ex.weak}\n` + `   why: ${ex.note}`
    )
    .join("\n");

  return [
    `Content Style Guide version: ${guide.version}`,
    "",
    "SYNOPSIS (main description on film cards):",
    `- ${guide.synopsis.job}`,
    `- Voice: ${guide.synopsis.voice}`,
    `- Structure: ${guide.synopsis.structure}`,
    `- One-glance test: ${guide.synopsis.oneGlanceTest}`,
    `- ${guide.synopsis.curatorialValue}`,
    `- Does NOT answer: ${(guide.synopsis.doesNotAnswer ?? []).join(" / ")}`,
    `- Target length: ${guide.length.synopsisMinWords}–${guide.length.synopsisTargetMaxWords} words (hard max ${guide.length.synopsisHardMaxWords}).`,
    `- Avoid: ${guide.synopsis.avoid.join("; ")}`,
    `- Field split: synopsis = situation/story you enter; the_mood = what watching feels like. Do not move mood/genre language into synopsis.`,
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
    "STRONG synopsis examples (match clarity + stop-point; do not copy wording):",
    examples,
    "",
    "WEAK synopsis examples (do not emulate):",
    weak,
  ].join("\n");
}

export { BANNED_PHRASES, BANNED_MOOD_PHRASES };
