import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMoodCorpusCandidate,
  moodOpeningKey,
  moodTokenOverlap,
  prepareMoodCorpus,
} from "./film-mood-corpus.mjs";
import {
  formatMoodWritingGuideForPrompt,
  MOOD_GUIDE_ID,
  selectRelevantMoodExamples,
} from "./film-mood-writing-guide.mjs";
import {
  flagMoodPatterns,
  measureMoodBatchMetrics,
  buildMoodOnlyWriterPrompt,
} from "./film-mood-only-rewrite.mjs";
import { buildContentCuratorPrompt } from "./film-discovery-content.mjs";

test("prepareMoodCorpus excludes empty, placeholders, and near-duplicates", () => {
  const films = [
    {
      id: "1",
      title: "A",
      catalog_visible: true,
      the_mood: "Quiet coastal dread under a slow, salt-stained rhythm.",
      moods: ["quiet", "eerie"],
      synopsis: "A lighthouse keeper hears the tide speak.",
    },
    {
      id: "2",
      title: "B",
      catalog_visible: true,
      the_mood: "placeholder",
      moods: ["quiet"],
    },
    {
      id: "3",
      title: "C",
      catalog_visible: false,
      the_mood: "Warm and playful family farce with bright chaos.",
      moods: ["warm"],
    },
    {
      id: "4",
      title: "D",
      catalog_visible: true,
      the_mood: "Quiet coastal dread under a slow, salt-stained rhythm.",
      moods: ["quiet", "eerie"],
    },
    {
      id: "5",
      title: "E",
      catalog_visible: true,
      the_mood: "Tender workshop humor under a slightly uncanny pulse.",
      moods: ["tender", "wry"],
    },
  ];

  const report = prepareMoodCorpus(films);
  assert.equal(report.included_in_corpus, 2);
  assert.ok(report.excluded >= 3);
  assert.ok(report.exclusion_reasons.placeholder >= 1);
  assert.ok(report.exclusion_reasons.not_catalog_visible >= 1);
  assert.ok(report.exclusion_reasons.near_duplicate >= 1);
  assert.equal(report.near_duplicates, 1);
});

test("evaluateMoodCorpusCandidate flags banned and short moods", () => {
  const short = evaluateMoodCorpusCandidate({
    catalog_visible: true,
    the_mood: "Dark vibe",
  });
  assert.equal(short.ok, false);
  assert.ok(short.reasons.includes("too_short"));
});

test("moodOpeningKey and overlap helpers work", () => {
  assert.equal(moodOpeningKey("Dark and stormy night of dread."), "dark and");
  assert.ok(
    moodTokenOverlap(
      "Quiet coastal dread under a slow rhythm.",
      "Quiet coastal dread under a slow pulse."
    ) > 0.7
  );
});

test("formatMoodWritingGuideForPrompt embeds version and sections", () => {
  const text = formatMoodWritingGuideForPrompt({
    version: MOOD_GUIDE_ID,
    final_guide: {
      sections: {
        purpose: "Tell how the film feels to watch.",
        core_principles: ["Be specific"],
        mood_dimensions: [{ name: "pace", detail: "rhythm of viewing" }],
        strong_patterns: [{ principle: "sensory framing", why: "grounds feel" }],
        weak_patterns: [
          { pattern: "with a steady rhythm", when_weak: "interchangeable" },
        ],
        syntax_library: [{ type: "contrast", principle: "surface vs undercurrent" }],
        specificity_test: "Could this describe several films?",
        relationship_with_synopsis: "No plot recap.",
        relationship_with_moods_tags: "Sentence + tags complement.",
        good_examples: [
          { the_mood: "Soft workshop humor under a slow pulse.", why: "specific" },
        ],
        anti_examples: [
          { the_mood: "Dark and tense, with a steady rhythm.", why: "stock" },
        ],
      },
    },
  });
  assert.match(text, /Resonale Mood Writing Guide version/);
  assert.match(text, /SPECIFICITY TEST/);
  assert.match(text, /Soft workshop humor/);
});

test("selectRelevantMoodExamples prefers tag overlap", () => {
  const guide = {
    final_guide: {
      good_examples: [
        { the_mood: "A", moods: ["quiet", "gentle"] },
        { the_mood: "B", moods: ["chaotic", "absurd"] },
        { the_mood: "C", moods: ["tense"] },
      ],
    },
  };
  const picked = selectRelevantMoodExamples(guide, ["quiet", "gentle"], 2);
  assert.equal(picked[0].the_mood, "A");
});

test("measureMoodBatchMetrics counts rhythm and openings", () => {
  const metrics = measureMoodBatchMetrics([
    { the_mood: "Dark and tense, with a steady rhythm throughout." },
    { the_mood: "Dark and eerie streets under rain." },
    { the_mood: "Dark and quiet rooms hold dread." },
    { the_mood: "Soft workshop humor under a slow pulse." },
  ]);
  assert.equal(metrics.with_a_rhythm_count, 1);
  assert.ok(metrics.repeated_opening_groups >= 1);
  assert.equal(flagMoodPatterns("Raw energy and distinctive vibes.").has_generic_wording, true);
});

test("buildMoodOnlyWriterPrompt includes guide and previous mood", () => {
  const prompt = buildMoodOnlyWriterPrompt(
    {
      title: "Padak",
      synopsis: "A fish fights in a tank.",
      moods: ["tense", "bleak"],
      previous_the_mood: "Tense and bleak, with a steady rhythm.",
    },
    {
      version: MOOD_GUIDE_ID,
      final_guide: {
        sections: {
          purpose: "feel",
          core_principles: ["specific"],
          good_examples: [
            { the_mood: "Claustrophobic tank dread with sudden violence.", moods: ["tense"] },
          ],
        },
      },
    },
    ["dark and"]
  );
  assert.match(prompt, /Mood Writing Guide/);
  assert.match(prompt, /Padak/);
  assert.match(prompt, /dark and/);
});

test("buildContentCuratorPrompt embeds Mood Writing Guide block", () => {
  const prompt = buildContentCuratorPrompt(
    {
      title: "Test Film",
      year: 2020,
      directors: ["A"],
      countries: ["FR"],
      source_urls: [],
    },
    { tmdbOverview: "overview", techniqueEvidence: [] },
    "",
    {
      moodGuide: {
        version: MOOD_GUIDE_ID,
        final_guide: {
          sections: {
            purpose: "viewing feel",
            core_principles: ["specificity first"],
            specificity_test: "several films?",
          },
        },
      },
      overusedMoodConstructions: ["serious and"],
    }
  );
  assert.match(prompt, /MOOD WRITING GUIDE/);
  assert.match(prompt, /specificity first/);
  assert.match(prompt, /serious and/);
});
