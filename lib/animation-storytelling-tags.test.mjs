import test from "node:test";
import assert from "node:assert/strict";
import {
  ANIMATION_STORYTELLING_TAGS_MAX,
  ANIMATION_STORYTELLING_VOCABULARY,
  normalizeAnimationStorytellingTagsPreferVocabulary,
  buildAnimationStorytellingTagsPrompt,
} from "./animation-storytelling-tags.mjs";

test("animation storytelling vocabulary is rich and controlled", () => {
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.length >= 35);
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.includes("wordless journey"));
  assert.ok(ANIMATION_STORYTELLING_VOCABULARY.includes("coming-of-age arc"));
});

test("prefer vocabulary keeps in-vocab tags and reports off-vocab", () => {
  const result = normalizeAnimationStorytellingTagsPreferVocabulary([
    "Character-Driven",
    "wordless journey",
    "not-a-real-tag",
    "character-driven",
  ]);
  assert.deepEqual(result.tags, ["character-driven", "wordless journey"]);
  assert.deepEqual(result.offVocabulary, ["not-a-real-tag"]);
  assert.ok(result.tags.length <= ANIMATION_STORYTELLING_TAGS_MAX);
});

test("animation storytelling prompt asks for storytelling only", () => {
  const prompt = buildAnimationStorytellingTagsPrompt({
    title: "Flow",
    synopsis: "A cat on a boat.",
    moods: ["melancholic"],
    aesthetic_tags: ["painterly"],
  });
  assert.match(prompt, /STORYTELLING tags/);
  assert.match(prompt, /wordless journey/);
  assert.match(prompt, /do not copy/i);
  assert.match(prompt, /Flow/);
});
