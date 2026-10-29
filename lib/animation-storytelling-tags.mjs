/**
 * Animation Plot tags (stored as storytelling_tags).
 *
 * Independent similarity axis alongside Mood and Visual.
 * Answers: “What happens in this film, and which plot elements make it interesting?”
 *
 * Tags name concrete situations, conflicts, event developments, and relationship
 * developments — not abstract narrative form, mood, or visual style.
 *
 * Vocabulary grew from free-form extraction over a diverse catalog sample, then
 * synonym merge. Size is driven by plot diversity, not a fixed cap.
 */

/** Soft floor — fewer precise tags beat padded approximate ones. */
export const ANIMATION_STORYTELLING_TAGS_MIN = 2;
export const ANIMATION_STORYTELLING_TAGS_MAX = 5;

/**
 * Gold-standard Plot tags from the product brief.
 * Used as deterministic overrides when retagging these titles.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const CANONICAL_ANIMATION_PLOT_TAGS_BY_TITLE = Object.freeze({
  Flow: Object.freeze(["survival", "shared journey", "building trust"]),
  "The Red Turtle": Object.freeze([
    "isolation",
    "survival",
    "unexpected encounter",
    "accepting change",
  ]),
  Coraline: Object.freeze([
    "parallel world discovery",
    "uncovering secrets",
    "confronting danger",
  ]),
  "Spirited Away": Object.freeze([
    "unfamiliar world",
    "adaptation",
    "overcoming trials",
    "rescuing loved ones",
  ]),
  "Chico & Rita": Object.freeze([
    "romantic love",
    "separation and reunion",
    "overcoming circumstances",
  ]),
  "My Life as a Courgette": Object.freeze([
    "family loss",
    "finding a new home",
    "friendship",
    "rebuilding trust",
  ]),
  "Mary and Max": Object.freeze([
    "unlikely friendship",
    "long-distance connection",
    "loneliness",
    "mutual acceptance",
  ]),
  "Fantastic Mr. Fox": Object.freeze([
    "family conflict",
    "risky scheme",
    "confrontation",
    "collective survival",
  ]),
  "Song of the Sea": Object.freeze([
    "family loss",
    "mythical journey",
    "family secrets",
    "reconciliation",
  ]),
  Persepolis: Object.freeze([
    "growing up",
    "political upheaval",
    "displacement",
    "searching for identity",
  ]),
  "The Boxtrolls": Object.freeze([
    "found family",
    "rescue mission",
    "social exclusion",
    "uncovering secrets",
  ]),
  Belle: Object.freeze([
    "virtual world discovery",
    "hidden identity",
    "building trust",
    "rescuing someone",
  ]),
});

/**
 * @param {string | null | undefined} title
 * @returns {string[] | null}
 */
export function getCanonicalAnimationPlotTags(title) {
  if (!title) return null;
  const tags = CANONICAL_ANIMATION_PLOT_TAGS_BY_TITLE[title];
  return tags ? [...tags] : null;
}

/**
 * Controlled vocabulary for animated-film plot situations.
 * Prefer reusing an existing tag over inventing a near-synonym.
 */
export const ANIMATION_STORYTELLING_VOCABULARY = Object.freeze([
  // Survival / danger / escape
  "survival",
  "collective survival",
  "escaping captivity",
  "confronting danger",
  "confronting a hidden threat",
  "violent conflict",
  "facing oppression",
  "facing bullying",
  "risky scheme",
  "confrontation",
  "rebellion against authority",
  "confronting authority",
  "risk and sacrifice",
  "obsessive pursuit",
  "protecting family",
  // Journeys / worlds / creative projects
  "shared journey",
  "forming a band",
  "pursuing artistic ambition",
  "creative struggle",
  "self-expression",
  "documentary filmmaking",
  "unfamiliar world",
  "parallel world discovery",
  "virtual world discovery",
  "crossing between worlds",
  "mythical journey",
  "journey through cultures",
  "displacement",
  "adaptation",
  "overcoming trials",
  "overcoming circumstances",
  "accepting change",
  // Secrets / identity / belonging
  "uncovering secrets",
  "family secrets",
  "family legacy",
  "hidden identity",
  "concealing identity",
  "searching for identity",
  "finding belonging",
  "found family",
  "social exclusion",
  "investigating a mystery",
  "search for connection",
  // Loss / home / family structure
  "family loss",
  "coping with loss",
  "finding a new home",
  "changing homes",
  "search for family",
  "family conflict",
  "generational conflict",
  "family reconciliation",
  "reconciliation",
  "caring for sibling",
  "sibling bond",
  "motherhood",
  "growing up",
  "political upheaval",
  "unplanned pregnancy",
  "navigating social expectations",
  // Relationships
  "building trust",
  "rebuilding trust",
  "friendship",
  "unlikely friendship",
  "long-distance connection",
  "mutual acceptance",
  "romantic love",
  "search for love",
  "love triangle",
  "accidental marriage",
  "unfinished love",
  "separation and reunion",
  "involuntary separation",
  "accepting separation",
  "isolation",
  "loneliness",
  "unexpected encounter",
  "overcoming prejudice",
  // Rescue / help
  "rescue mission",
  "rescuing loved ones",
  "rescuing someone",
  "supporting a partner through illness",
  "search for closure",
]);

/**
 * Retired labels: former narrative-mechanics tags + near-duplicates collapsed
 * during vocab consolidation. Strip on normalize until refill completes.
 */
export const ANIMATION_STORYTELLING_RETIRED_TAGS = Object.freeze([
  // Old mechanics vocabulary
  "character-driven",
  "quest-driven",
  "plot-driven",
  "mystery-driven",
  "adventure momentum",
  "fast-paced",
  "slow-burn",
  "conversation-led",
  "relationship-driven",
  "linear",
  "episodic",
  "vignette structure",
  "nonlinear",
  "ensemble story",
  "caper structure",
  "fairy-tale structure",
  "folk-tale structure",
  "mythic tale",
  "road journey",
  "escape journey",
  "survival journey",
  "transformation arc",
  "coming-of-age arc",
  "metamorphosis arc",
  "world discovery",
  "strange world discovery",
  "magical world discovery",
  "quiet character study",
  "psychological portrait",
  "observational story",
  "meditative journey",
  "atmospheric drift",
  "wordless journey",
  "symbolic journey",
  "philosophical fable",
  "satirical fable",
  "absurdist comedy",
  "surreal odyssey",
  "clear narrative",
  "minimal plot",
  "simple story",
  "emotionally layered",
  // Collapsed synonyms / too vague after plot redesign
  "identity search",
  "identity exploration",
  "self-discovery journey",
  "mythic journey",
  "struggle for survival",
  "community survival",
  "learning to trust",
  "long-distance friendship",
  "isolation and connection",
  "facing hidden dangers",
  "growing up during revolution",
  "losing a parent",
  "looking back on loss",
  "overcoming challenges",
  "overcoming loneliness",
  "falling in love",
  "navigating change",
  "mysterious connection",
  "unexpected gift",
  "childhood connection",
  "reunion of friends",
  "supporting each other",
  "search for meaning",
  "searching for connection",
  "musical journey",
  "motherhood challenges",
  "conflict between control and freedom",
  "investigating clues",
  "artistic ambition",
  "creative collaboration",
]);

const VOCAB_SET = new Set(
  ANIMATION_STORYTELLING_VOCABULARY.map((tag) => tag.toLowerCase())
);

const RETIRED_SET = new Set(
  ANIMATION_STORYTELLING_RETIRED_TAGS.map((tag) => tag.toLowerCase())
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
    .filter(Boolean)
    .filter((tag) => !RETIRED_SET.has(tag));
  return [...new Set(cleaned)].slice(0, ANIMATION_STORYTELLING_TAGS_MAX);
}

/**
 * Keep controlled vocabulary only; collect off-vocab proposals for review.
 * Retired labels are dropped (not reported as suggestions).
 * @param {unknown} value
 * @returns {{ tags: string[], offVocabulary: string[] }}
 */
export function normalizeAnimationStorytellingTagsPreferVocabulary(value) {
  const all = normalizeAnimationStorytellingTags(value);
  const tags = all.filter((tag) => VOCAB_SET.has(tag));
  const offVocabulary = all.filter(
    (tag) => !VOCAB_SET.has(tag) && !RETIRED_SET.has(tag)
  );
  return { tags, offVocabulary };
}

export function buildAnimationStorytellingTagsPromptSection() {
  const vocab = ANIMATION_STORYTELLING_VOCABULARY.join(", ");
  const canonicalLines = Object.entries(CANONICAL_ANIMATION_PLOT_TAGS_BY_TITLE)
    .map(([title, tags]) => `- ${title} → ${tags.join(", ")}`)
    .join("\n");

  return `
PLOT tags (storytelling_tags) — animated films:
Answer: what happens in this film, and which plot elements make the story interesting?

Tags name concrete plot situations, conflicts, how events develop, and how
relationships develop. Level of specificity:
- TOO ABSTRACT (never use): character-driven, quest-driven, transformation arc,
  linear, episodic, emotionally layered, relationship-driven, coming-of-age,
  adventure, drama
- GOOD: survival, shared journey, building trust, unlikely friendship,
  uncovering secrets, separation and reunion, finding belonging,
  family reconciliation, escaping captivity, searching for identity, coping with loss
- TOO SPECIFIC (never use): a cat surviving a flood, a girl discovering a door
  in her house, two musicians falling in love in Havana

=== Tag selection workflow (mandatory order) ===

Step A — Free plot elements (ignore the vocabulary):
Privately list the 3–5 most characteristic plot elements of THIS film —
what a viewer would say the story is "about" as plot, not mood or look.

Step B — Map to vocabulary:
For each free element:
- If a vocab tag is exact or clearly semantically equivalent → use that vocab wording.
- If no good match → put a precise new phrase in suggested_storytelling_tags.
- NEVER replace a missing element with an approximately related general vocab tag.
- NEVER add vocab tags only to reach a count of 3–5.

Key rule: better 2 exact vocab tags + 3 suggestions than 5 approximate vocab tags.
Target ${ANIMATION_STORYTELLING_TAGS_MIN}–${ANIMATION_STORYTELLING_TAGS_MAX} vocab tags when they truly fit;
fewer is correct when the vocabulary does not cover the plot.

=== Common tags — use only when central to the plot ===

These are allowed but overused. Apply only when the element is a primary dramatized engine,
not a side-effect, background, or generic consequence:
- building trust — gradual trust-forming is the story (e.g. Flow); NOT automatic with friendship/romance/teamwork
- finding belonging — seeking a place to fit is the story; NOT automatic with any outsider character
- searching for identity — identity search is the story; NOT automatic with any character change/growth
- uncovering secrets — investigation/revelation drives events; NOT automatic because something unknown exists
- confronting danger — facing danger is the story's engine; NOT automatic because peril appears
- overcoming circumstances — overcoming a concrete external bind is central; NOT any hardship
- accepting change — accepting a life change is the story; NOT any arc of growth
- facing oppression — systemic/group oppression is central; NOT any antagonist pressure

Prefer a more specific tag when available
(e.g. obsessive pursuit > confronting danger; concealing identity > searching for identity;
involuntary separation / accepting separation > separation and reunion when reunion is absent;
forming a band / pursuing artistic ambition > shared journey for creative projects;
crossing between worlds / accidental marriage > unexpected encounter when those are the plot).

Near-synonym discrimination:
- found family ≠ finding belonging
- family secrets ≠ uncovering secrets ≠ family legacy
- isolation ≠ loneliness
- building trust ≠ rebuilding trust
- friendship ≠ unlikely friendship
- parallel world discovery ≠ unfamiliar world ≠ virtual world discovery ≠ crossing between worlds
- hidden identity ≠ concealing identity (secret self vs active disguise)
- separation and reunion ≠ involuntary separation ≠ accepting separation
- investigating a mystery ≠ uncovering secrets (mystery-investigation engine vs secrets generally)
- rescue mission ≠ rescuing loved ones ≠ rescuing someone
- romantic love ≠ search for love ≠ unfinished love ≠ love triangle
- finding a new home ≠ changing homes

Do NOT tag Mood (viewer emotion), Visual style, or narrative form/mechanics.

Vocabulary (reuse these wordings in storytelling_tags when they truly fit):
${vocab}

Canonical examples — if the film is one of these titles, use EXACTLY these tags:
${canonicalLines}

Return storytelling_tags = only exact/equivalent vocab matches that survived Step B.
Return suggested_storytelling_tags = precise missing patterns (2–4 words, same specificity level as vocab).
`.trim();
}

/**
 * @param {object} film
 */
export function buildAnimationStorytellingTagsPrompt(film) {
  return `
You are tagging animated feature films for plot similarity (Plot axis).

We already have MOOD tags and VISUAL / aesthetic tags.
Now generate PLOT tags only (stored as storytelling_tags).

Three independent layers (do not conflate):
1) MOODS — what the film makes the viewer feel.
2) VISUAL / MATERIAL — how it looks and is crafted.
3) PLOT — what happens: situations, conflicts, event and relationship developments.

${buildAnimationStorytellingTagsPromptSection()}

Film:
Title: ${film.title ?? ""}
Original title: ${film.original_title ?? ""}
Year: ${film.year ?? ""}
Director: ${film.director ?? ""}
Country: ${film.country ?? ""}
Technique: ${film.technique ?? ""}
Synopsis: ${film.synopsis ?? ""}
What it is: ${film.what_it_is ?? ""}
The mood sentence (do not copy as plot): ${film.the_mood ?? ""}
Moods (do not copy): ${(film.moods ?? []).join(", ")}
Aesthetic tags (do not copy): ${(film.aesthetic_tags ?? []).join(", ")}

Return only JSON:
{
  "storytelling_tags": ["...", "..."],
  "suggested_storytelling_tags": []
}
`.trim();
}
