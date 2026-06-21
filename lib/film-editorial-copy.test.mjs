import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEditorialCopyPrompt,
  cleanupEditorialField,
  findMoodRestraintIssues,
  validateEditorialCopy,
} from "./film-editorial-copy.mjs";

describe("film editorial copy helpers", () => {
  it("cleans wrapped quotes and extra whitespace", () => {
    assert.equal(
      cleanupEditorialField('  "A stop-motion tale."  '),
      "A stop-motion tale."
    );
  });

  it("accepts restrained direct mood language", () => {
    const result = validateEditorialCopy({
      what_it_is:
        "After being killed in a diner, a shy manga artist is thrown into a wildly changing world of gangsters, strange creatures and impossible escapes.",
      the_mood:
        "Hyperactive, vulgar, euphoric and disorienting; it keeps changing shape before you can settle into it.",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
  });

  it("accepts factual what_it_is with direct mood notes from the quality bar", () => {
    const samples = [
      {
        what_it_is:
          "An Afghan man tells, for the first time, how he fled his country as a child and built a new life in Denmark while hiding parts of his past.",
        the_mood:
          "Quiet and fragile, with an emotional tension that grows through what is left unsaid.",
      },
      {
        what_it_is:
          "A boy raised by trash-collecting Boxtrolls gets caught up in the town's hunt for them and the cheese lord Archibald Snatcher's plan to wipe them out.",
        the_mood:
          "Tactile, funny and slightly grotesque, with more nervous energy than its cozy look suggests.",
      },
    ];

    for (const sample of samples) {
      const result = validateEditorialCopy(sample);
      assert.equal(result.ok, true, result.issues.join("; "));
    }
  });

  it("rejects poetic mood metaphors and similes", () => {
    const result = validateEditorialCopy({
      what_it_is:
        "After a fatal encounter in a sleazy diner, a timid manga artist escapes into a kaleidoscopic world of gangsters, surreal monsters, and his own psyche while chasing lost love.",
      the_mood:
        "Frantic and electric, like a fever dream that shifts between euphoria and dread with every pulsating frame.",
    });

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.includes('"like"')));
    assert.ok(result.issues.some((issue) => issue.includes("fever dream")));
    assert.ok(result.issues.some((issue) => issue.includes("his own psyche")));
    assert.ok(result.issues.some((issue) => issue.includes("chasing lost love")));
  });

  it("rejects generic trailer phrasing and abstract theme words", () => {
    const result = validateEditorialCopy({
      what_it_is:
        "A stop-motion tale confronting societal fears and class divides in a whimsical yet poignant quest for identity and belonging.",
      the_mood: "Playful, anxious, tactile, bittersweet — a blend of charm and unease.",
    });

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.includes("societal fears")));
    assert.ok(result.issues.some((issue) => issue.includes("a blend of")));
  });

  it("findMoodRestraintIssues flags similes and interpretive language", () => {
    const issues = findMoodRestraintIssues(
      "Like a lullaby that reveals a dark underbelly of heartache and grief."
    );

    assert.ok(issues.some((issue) => issue.includes('"like"')));
    assert.ok(issues.some((issue) => issue.includes("reveals")));
    assert.ok(issues.some((issue) => issue.includes("abstract nouns")));
  });

  it("builds a prompt focused on restraint and direct mood language", () => {
    const prompt = buildEditorialCopyPrompt(
      {
        title: "Mind Game",
        original_title: "Mind Game",
        director: "Masaaki Yuasa",
        year: 2004,
        country: "Japan",
        duration_minutes: 103,
        technique: "2D animation",
        moods: ["hyperactive"],
        aesthetic_tags: ["fluid"],
        narrative_tags: ["surreal"],
        synopsis: "A manga artist dies and enters a shifting world...",
      },
      "Remove similes from the_mood."
    );

    assert.match(prompt, /Do not use similes, metaphors, or the word "like"/);
    assert.match(prompt, /Hyperactive, vulgar, euphoric and disorienting/);
    assert.match(prompt, /Remove similes from the_mood/);
  });
});
