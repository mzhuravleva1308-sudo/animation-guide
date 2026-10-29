import test from "node:test";
import assert from "node:assert/strict";
import {
  ANIMATION_STORYTELLING_TAGS_MAX,
  ANIMATION_STORYTELLING_TAGS_MIN,
  ANIMATION_STORYTELLING_VOCABULARY,
  ANIMATION_STORYTELLING_RETIRED_TAGS,
  CANONICAL_ANIMATION_PLOT_TAGS_BY_TITLE,
  getCanonicalAnimationPlotTags,
  normalizeAnimationStorytellingTagsPreferVocabulary,
  buildAnimationStorytellingTagsPrompt,
} from "./animation-storytelling-tags.mjs";

test("animation plot vocabulary is situational, not narrative mechanics", () => {
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.length >= 70);
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.includes("survival"));
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.includes("shared journey"));
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.includes("building trust"));
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.includes("uncovering secrets"));
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.includes("concealing identity"));
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.includes("involuntary separation"));
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.includes("investigating a mystery"));
  assert.equal(ANIMATION_STORYTELLING_TAGS_MIN, 2);
  assert.equal(ANIMATION_STORYTELLING_TAGS_MAX, 5);
  for (const retired of [
    "character-driven",
    "quest-driven",
    "transformation arc",
    "linear",
    "relationship-driven",
    "investigating clues",
  ]) {
    assert.equal(
      ANIMATION_STORYTELLING_VOCABULARY.includes(retired),
      false,
      `retired/mechanics tag still in vocab: ${retired}`
    );
    assert.ok(ANIMATION_STORYTELLING_RETIRED_TAGS.includes(retired));
  }
});

test("prefer vocabulary keeps plot tags and drops retired mechanics", () => {
  const result = normalizeAnimationStorytellingTagsPreferVocabulary([
    "Survival",
    "character-driven",
    "shared journey",
    "building trust",
    "not-a-real-tag",
    "quest-driven",
  ]);
  assert.deepEqual(result.tags, [
    "survival",
    "shared journey",
    "building trust",
  ]);
  assert.deepEqual(result.offVocabulary, ["not-a-real-tag"]);
  assert.ok(result.tags.length <= ANIMATION_STORYTELLING_TAGS_MAX);
});

test("animation plot prompt encodes free-then-map workflow", () => {
  const prompt = buildAnimationStorytellingTagsPrompt({
    title: "Flow",
    synopsis: "A cat on a boat.",
    moods: ["melancholic"],
    aesthetic_tags: ["painterly"],
  });
  assert.match(prompt, /PLOT tags/);
  assert.match(prompt, /Tag selection workflow/);
  assert.match(prompt, /better 2 exact vocab tags/);
  assert.match(prompt, /Common tags — use only when central/);
  assert.match(prompt, /do not copy/i);
  assert.match(prompt, /Flow/);
});

test("canonical brief titles resolve to exact plot tags", () => {
  assert.deepEqual(getCanonicalAnimationPlotTags("Flow"), [
    "survival",
    "shared journey",
    "building trust",
  ]);
  assert.equal(getCanonicalAnimationPlotTags("Unknown Film"), null);
  for (const [title, tags] of Object.entries(CANONICAL_ANIMATION_PLOT_TAGS_BY_TITLE)) {
    for (const tag of tags) {
      assert.ok(
        ANIMATION_STORYTELLING_VOCABULARY.includes(tag),
        `${title}: missing vocab tag "${tag}"`
      );
    }
  }
});
