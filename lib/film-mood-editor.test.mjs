import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMoodEditorToBatch,
  buildMoodEditorPrompt,
  normalizeMoodEditorResponse,
  runMoodEditorPass,
} from "./film-mood-editor.mjs";
import {
  buildContentCandidatePatch,
  runDiscoveryContentBatch,
} from "./film-discovery-content.mjs";
import { DISCOVERY_CONTENT_STATUS } from "./film-discovery.mjs";

const writerA =
  "Cold blues and tight framing trap the mackerel in mounting dread, the slow pace sharpening claustrophobia and melancholy.";
const writerB =
  "Muted colors and slow pacing press a bleak atmosphere where social control and personal threat build with anxious intensity.";
const improvedB =
  "Muted colors and slow pacing tighten around a bleak town where cult pressure and private fear never loosen.";

function baseRows() {
  return [
    {
      id: "1",
      title: "Padak",
      synopsis: "A mackerel trapped in a restaurant aquarium struggles to escape before being eaten.",
      the_mood: writerA,
      technique: "2D animation",
      moods: ["tense", "claustrophobic"],
      content_status: DISCOVERY_CONTENT_STATUS.ready,
      content_note: null,
      content_revision_count: 0,
      skipped: false,
      diagnostics: {},
      _candidateId: "1",
    },
    {
      id: "2",
      title: "The Fake",
      synopsis: "A convict returns to his hometown to confront his family and challenge a local religious cult.",
      the_mood: writerB,
      technique: "2D animation",
      moods: ["dark", "anxious"],
      content_status: DISCOVERY_CONTENT_STATUS.ready,
      content_note: "existing note",
      content_revision_count: 0,
      skipped: false,
      diagnostics: {},
      _candidateId: "2",
    },
  ];
}

test("Mood Editor KEEP preserves writer draft", () => {
  const { rows, summary } = applyMoodEditorToBatch(baseRows(), {
    decisions: [
      { title: "Padak", decision: "KEEP", issue_codes: [], revised_the_mood: null },
      { title: "The Fake", decision: "KEEP", issue_codes: [], revised_the_mood: null },
    ],
  });
  assert.equal(rows[0].the_mood, writerA);
  assert.equal(rows[1].the_mood, writerB);
  assert.equal(summary.KEEP, 2);
  assert.equal(summary.IMPROVE, 0);
  assert.equal(summary.editorial_passes, 1);
  assert.equal(rows[0].diagnostics.mood_editor.decision, "KEEP");
  assert.equal(rows[0].diagnostics.mood_editor.writer_draft, writerA);
});

test("Mood Editor IMPROVE replaces only the_mood", () => {
  const before = baseRows();
  const { rows, summary } = applyMoodEditorToBatch(before, {
    decisions: [
      { title: "Padak", decision: "KEEP", issue_codes: [] },
      {
        title: "The Fake",
        decision: "IMPROVE",
        issue_codes: ["generic_interchangeable"],
        revised_the_mood: improvedB,
        issue: "anxious intensity filler",
      },
    ],
  });
  assert.equal(rows[0].the_mood, writerA);
  assert.equal(rows[1].the_mood, improvedB);
  assert.equal(rows[1].synopsis, before[1].synopsis);
  assert.equal(rows[1].technique, before[1].technique);
  assert.deepEqual(rows[1].moods, before[1].moods);
  assert.equal(rows[1].content_note, "existing note");
  assert.equal(rows[1].content_status, DISCOVERY_CONTENT_STATUS.ready);
  assert.equal(rows[1].content_revision_count, 0);
  assert.equal(summary.IMPROVE, 1);
  assert.equal(summary.improve_applied, 1);
  assert.equal(rows[1].diagnostics.mood_editor.applied, true);
  assert.equal(rows[1].diagnostics.mood_editor.writer_draft, writerB);
  assert.equal(rows[1].diagnostics.mood_editor.revised_the_mood, improvedB);
});

test("invalid Mood Editor revision falls back to writer draft", () => {
  const { rows, summary } = applyMoodEditorToBatch(baseRows(), {
    decisions: [
      { title: "Padak", decision: "KEEP", issue_codes: [] },
      {
        title: "The Fake",
        decision: "IMPROVE",
        issue_codes: ["awkward_english"],
        revised_the_mood: "", // empty → fallback
      },
    ],
  });
  assert.equal(rows[1].the_mood, writerB);
  assert.equal(summary.improve_fallback_to_writer, 1);
  assert.equal(rows[1].diagnostics.mood_editor.applied, false);
  assert.match(rows[1].diagnostics.mood_editor.fallback_reason, /empty_revision/);
});

test("invalid long Mood Editor revision falls back without rewrite loop", () => {
  const tooLong =
    "This mood line is intentionally far too long for the editorial budget and should be rejected by deterministic validation so the writer draft remains in place without another revision cycle.";
  const { rows, summary } = applyMoodEditorToBatch(baseRows(), {
    decisions: [
      {
        title: "Padak",
        decision: "IMPROVE",
        issue_codes: ["ornamental_review_copy"],
        revised_the_mood: tooLong,
      },
      { title: "The Fake", decision: "KEEP", issue_codes: [] },
    ],
  });
  assert.equal(rows[0].the_mood, writerA);
  assert.equal(summary.editorial_passes, 1);
  assert.equal(summary.improve_fallback_to_writer, 1);
  assert.match(
    rows[0].diagnostics.mood_editor.fallback_reason,
    /validation_failed/
  );
});

test("normalizeMoodEditorResponse defaults missing titles to KEEP", () => {
  const normalized = normalizeMoodEditorResponse(
    {
      decisions: [
        {
          title: "The Fake",
          decision: "IMPROVE",
          issue_codes: ["generic_interchangeable"],
          revised_the_mood: improvedB,
        },
      ],
    },
    [
      { title: "Padak", the_mood: writerA },
      { title: "The Fake", the_mood: writerB },
    ]
  );
  assert.equal(normalized.decisions.length, 2);
  const padak = normalized.decisions.find((row) => row.title === "Padak");
  assert.equal(padak.decision, "KEEP");
  assert.equal(padak.missing_from_editor, true);
});

test("buildMoodEditorPrompt includes batch moods and guide", () => {
  const prompt = buildMoodEditorPrompt(
    [
      { title: "Padak", synopsis: "Fish", technique: "2D animation", the_mood: writerA },
      { title: "The Fake", synopsis: "Cult", technique: null, the_mood: writerB },
    ],
    {
      version: "resonale-mood-writing-guide-v2",
      final_guide: {
        sections: {
          purpose: "watching feel",
          core_principles: ["Be specific"],
          mood_dimensions: [],
          strong_patterns: [],
          weak_patterns: [],
          syntax_library: [],
          specificity_test: "unique?",
          relationship_with_synopsis: "complement",
          relationship_with_moods_tags: "synthesize",
          good_examples: [],
          anti_examples: [],
        },
      },
    }
  );
  assert.match(prompt, /Mood Editor/);
  assert.match(prompt, /Padak/);
  assert.match(prompt, /The Fake/);
  assert.match(prompt, /writer_the_mood/);
  assert.match(prompt, /Do not rewrite a good line/i);
});

test("runMoodEditorPass applies IMPROVE once via editorFn", async () => {
  let editorCalls = 0;
  const { rows, summary } = await runMoodEditorPass(baseRows(), {
    editorFn: async () => {
      editorCalls += 1;
      return {
        batch_observations: ["intensity filler on The Fake"],
        decisions: [
          { title: "Padak", decision: "KEEP" },
          {
            title: "The Fake",
            decision: "IMPROVE",
            issue_codes: ["generic_interchangeable"],
            revised_the_mood: improvedB,
          },
        ],
      };
    },
  });
  assert.equal(editorCalls, 1);
  assert.equal(summary.editorial_passes, 1);
  assert.equal(rows[1].the_mood, improvedB);
  assert.equal(rows[0].the_mood, writerA);
});

test("content batch Mood Editor changes only the_mood in persist patch", async () => {
  /** @type {object[]} */
  const writes = [];
  const report = await runDiscoveryContentBatch(
    [
      {
        id: "1",
        title: "Padak",
        year: 2012,
        directors: ["D"],
        countries: ["KR"],
        eligibility_result: "PASS",
        content_status: DISCOVERY_CONTENT_STATUS.pending,
      },
      {
        id: "2",
        title: "The Fake",
        year: 2013,
        directors: ["D"],
        countries: ["KR"],
        eligibility_result: "PASS",
        content_status: DISCOVERY_CONTENT_STATUS.pending,
      },
    ],
    {
      dryRun: false,
      skipEmail: true,
      delayMs: 0,
      skipMoodGuideRewrite: true,
      curateFn: async (candidate) => ({
        ...buildContentCandidatePatch({
          synopsis:
            candidate.title === "Padak"
              ? "A mackerel trapped in a restaurant aquarium struggles to escape before being eaten."
              : "A convict returns to his hometown to confront his family and challenge a local religious cult.",
          the_mood: candidate.title === "Padak" ? writerA : writerB,
          technique: "2D animation",
          moods: ["tense", "dark", "anxious", "bleak"],
          content_status: DISCOVERY_CONTENT_STATUS.ready,
          content_note: null,
          content_revision_count: 0,
        }),
        diagnostics: {
          reviewer_branch: "PASS",
          reviewer_verdict: "PASS",
          acceptance: "accepted_first_pass",
        },
      }),
      moodEditorFn: async () => ({
        batch_observations: ["one generic intensity line"],
        decisions: [
          { title: "Padak", decision: "KEEP" },
          {
            title: "The Fake",
            decision: "IMPROVE",
            issue_codes: ["generic_interchangeable"],
            revised_the_mood: improvedB,
          },
        ],
      }),
      updateFn: async (id, patch) => {
        writes.push({ id, patch });
      },
    }
  );

  assert.equal(report.writes_to_films_table, false);
  assert.equal(report.review_status_unchanged, true);
  assert.equal(report.mood_editor.KEEP, 1);
  assert.equal(report.mood_editor.IMPROVE, 1);
  assert.equal(report.mood_editor.improve_applied, 1);
  assert.equal(report.mood_editor.guide_auto_updated, false);
  assert.equal(writes.length, 2);

  const fakeWrite = writes.find((row) => row.id === "2");
  assert.equal(fakeWrite.patch.the_mood, improvedB);
  assert.equal(
    fakeWrite.patch.synopsis,
    "A convict returns to his hometown to confront his family and challenge a local religious cult."
  );
  assert.equal(fakeWrite.patch.technique, "2D animation");
  assert.ok(!("mood_editor" in fakeWrite.patch));
  assert.ok(!("diagnostics" in fakeWrite.patch));
  assert.equal(fakeWrite.patch.content_note, null);

  const padakResult = report.results.find((row) => row.title === "Padak");
  const fakeResult = report.results.find((row) => row.title === "The Fake");
  assert.equal(padakResult.the_mood, writerA);
  assert.equal(fakeResult.the_mood, improvedB);
  assert.equal(fakeResult.diagnostics.mood_editor.decision, "IMPROVE");
  // Diagnostics live on artifact rows, not permanent patch shape.
  const permanent = buildContentCandidatePatch(fakeResult);
  assert.equal(permanent.the_mood, improvedB);
  assert.equal("mood_editor" in permanent, false);
  assert.equal("diagnostics" in permanent, false);
});

test("content batch without editorFn/openai skips Mood Editor", async () => {
  const report = await runDiscoveryContentBatch(
    [
      {
        id: "1",
        title: "A",
        year: 2020,
        directors: ["D"],
        countries: ["F"],
        eligibility_result: "PASS",
        content_status: DISCOVERY_CONTENT_STATUS.pending,
      },
    ],
    {
      dryRun: true,
      skipEmail: true,
      delayMs: 0,
      skipMoodGuideRewrite: true,
      curateFn: async () => ({
        ...buildContentCandidatePatch({
          synopsis: "A short valid synopsis about a specific film situation.",
          the_mood: writerA,
          technique: "2D animation",
          moods: ["tense", "dark", "anxious", "bleak"],
          content_status: DISCOVERY_CONTENT_STATUS.ready,
          content_revision_count: 0,
        }),
        diagnostics: { reviewer_branch: "PASS", reviewer_verdict: "PASS" },
      }),
    }
  );
  assert.equal(report.mood_editor, null);
  assert.equal(report.results[0].the_mood, writerA);
  assert.equal(report.writes_to_films_table, false);
});
