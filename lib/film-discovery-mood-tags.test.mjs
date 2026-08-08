import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDiscoveryMoodTagsPreferCatalog,
  buildMoodTagsPromptSection,
} from "./film-discovery-mood-tags.mjs";
import { buildAestheticTagsPromptSection } from "./film-discovery-aesthetic-tags.mjs";

test("normalizeDiscoveryMoodTagsPreferCatalog keeps catalog tags", () => {
  const { moods, offVocabulary } = normalizeDiscoveryMoodTagsPreferCatalog([
    "Tender",
    "bittersweet",
    "handmade",
    "hopeful",
    "intimate",
  ]);
  assert.ok(moods.includes("tender"));
  assert.ok(moods.includes("hopeful"));
  assert.ok(offVocabulary.includes("handmade"));
  assert.ok(!moods.includes("handmade"));
});

test("AI catalog prompts mention fill scripts", () => {
  assert.match(buildMoodTagsPromptSection(), /fill-emotional-tags/);
  assert.match(buildAestheticTagsPromptSection({}), /fill-aesthetic-tags/);
  assert.match(buildAestheticTagsPromptSection({}), /2–4 word/);
});
