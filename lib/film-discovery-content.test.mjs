import assert from "node:assert/strict";
import test from "node:test";
import {
  DISCOVERY_CONTENT_STATUS,
  DISCOVERY_CONTENT_VERDICT,
  DISCOVERY_ELIGIBILITY,
} from "./film-discovery.mjs";
import {
  CONTENT_STYLE_GUIDE_VERSION,
  getContentStyleGuide,
} from "./film-discovery-content-style-guide.mjs";
import {
  buildContentCandidatePatch,
  composeContentNote,
  findSynopsisNameLikeTokens,
  isContentResumeEligible,
  resolveContentAcceptance,
  runContentPipelineForCandidate,
  runDiscoveryContentBatch,
  shouldRunContentCurator,
  synopsisHasPlotChain,
  validateDiscoveryContentDraft,
} from "./film-discovery-content.mjs";
import {
  normalizeDiscoveryTechniqueLabels,
  resolveTechniqueStatusPolicy,
} from "./film-discovery-technique.mjs";
import { analyzeBatchEditorialPatterns } from "./film-discovery-content-batch-audit.mjs";
import { formatWeeklyFilmDiscoveryEmail } from "./film-discovery-email.mjs";
import { runWeeklyFilmDiscovery } from "./film-discovery-workflow.mjs";
import { normalizeResearcherCandidate } from "./film-discovery-eligibility.mjs";

function makeEvidence() {
  return {
    full_length_feature: "90m",
    fully_animated: "yes",
    no_live_action_or_archive: "yes",
    not_children_oriented: "adult",
    independent_auteur_or_festival: "yes",
    not_in_catalog: "yes",
    standalone_release: "yes",
    reliable_sources: "yes",
  };
}

function makeCandidate(overrides = {}) {
  return normalizeResearcherCandidate({
    title: "Content Film",
    original_title: "Content Film",
    year: 2019,
    directors: ["Dir"],
    countries: ["France"],
    runtime_minutes: 90,
    source_urls: ["https://example.com"],
    researcher_why: "fit",
    manager_why: "gap",
    requirement_evidence: makeEvidence(),
    ...overrides,
  });
}

const goodDraft = {
  synopsis:
    "A shy repairman in a coastal town builds a wooden machine that starts answering questions he never asked out loud.",
  the_mood:
    "Soft workshop humor under a slow, slightly uncanny rhythm.",
  technique: ["stop-motion animation"],
  moods: ["quiet", "gentle", "wry", "strange"],
  aesthetic_tags: ["handmade", "tactile", "miniature world", "wooden textures"],
  copy_notes: null,
  technique_notes: null,
};

const stopMotionEvidence = {
  label: "stop-motion animation",
  sourceLabel: "test",
  evidenceSummary: "stop-motion puppet feature",
  confidence: 0.9,
  tier: "editorial",
  distinctive: true,
};

const testFactPack = {
  sources: ["test"],
  tmdbOverview:
    "Somewhere a man repairs things while the tide comes in each evening.",
  techniqueEvidence: [stopMotionEvidence],
  hasDirectTechniqueEvidence: true,
  researchCompleted: true,
  descriptionsBasedOnlyOnTmdbOverview: false,
};

test("both roles share one Content Style Guide version", () => {
  const guide = getContentStyleGuide();
  assert.equal(guide.version, CONTENT_STYLE_GUIDE_VERSION);
  assert.equal(guide.version, "resonale-content-style-v5");
  assert.match(guide.synopsis.job, /central situation/i);
  assert.ok((guide.weakExamples ?? []).length >= 5);
});

test("synopsis name-stack and plot-chain helpers", () => {
  assert.deepEqual(
    findSynopsisNameLikeTokens(
      "A shy repairman in a coastal town builds a wooden machine."
    ),
    []
  );
  assert.deepEqual(
    findSynopsisNameLikeTokens(
      "During wartime, Marie meets Jean and they flee the city together."
    ),
    ["Marie", "Jean"]
  );
  assert.equal(
    synopsisHasPlotChain(
      "A clerk wanders the city, then later joins a cult, and eventually burns the archive."
    ),
    true
  );
  assert.equal(
    synopsisHasPlotChain(
      "A shy repairman in a coastal town builds a wooden machine that starts answering questions."
    ),
    false
  );
});

test("validateDiscoveryContentDraft flags name-stack as hard issue", () => {
  const validated = validateDiscoveryContentDraft(
    {
      ...goodDraft,
      synopsis:
        "In wartime Kyoto, Hiroshi and Akira chase a rumor across the city while secrets pile up.",
    },
    { techniqueEvidence: [stopMotionEvidence] }
  );
  assert.equal(validated.ok, false);
  assert.ok(validated.issues.some((issue) => /name-stack/i.test(issue)));
});

test("validateDiscoveryContentDraft soft-notes plot-chain lean", () => {
  const validated = validateDiscoveryContentDraft(
    {
      ...goodDraft,
      synopsis:
        "A lonely pilot maps empty skies, then later finds a passenger who may not be human.",
    },
    { techniqueEvidence: [stopMotionEvidence] }
  );
  assert.ok(validated.softNotes.some((note) => /plot chain/i.test(note)));
});

test("validateDiscoveryContentDraft soft-notes generic conflict verbs", () => {
  const validated = validateDiscoveryContentDraft(
    {
      ...goodDraft,
      synopsis:
        "Art students in 1990s China balance creative ambitions and personal relationships amid change.",
    },
    { techniqueEvidence: [stopMotionEvidence] }
  );
  assert.ok(
    validated.softNotes.some((note) => /generic conflict verb/i.test(note))
  );
});

test("Content writer runs only after Eligibility PASS", () => {
  assert.equal(shouldRunContentCurator({ eligibility_result: "PASS" }), true);
  assert.equal(shouldRunContentCurator({ eligibility_result: "FAIL" }), false);
});

test("PASS does not call revision and keeps text byte-for-byte", async () => {
  let revisionCalls = 0;
  const result = await runContentPipelineForCandidate(makeCandidate(), {
    eligibilityResult: "PASS",
    gatherFactsFn: async () => ({ ...testFactPack }),
    curatorFn: async () => ({ ...goodDraft }),
    reviewerFn: async () => ({
      verdict: "PASS",
      issues: [],
      notes: [],
      summary: "On standard",
    }),
    revisionFn: async () => {
      revisionCalls += 1;
      return goodDraft;
    },
  });
  assert.equal(revisionCalls, 0);
  assert.equal(result.diagnostics.reviewer_verdict, "PASS");
  assert.equal(result.content_revision_count, 0);
  assert.equal(result.synopsis, goodDraft.synopsis);
  assert.equal(result.the_mood, goodDraft.the_mood);
  assert.equal(result.diagnostics.initial_byte_equal_final, true);
  assert.ok(
    [
      DISCOVERY_CONTENT_STATUS.ready,
      DISCOVERY_CONTENT_STATUS.readyWithNote,
    ].includes(result.content_status)
  );
  assert.equal(result.content_reviewer_verdict, undefined);
  assert.equal(result.content_provenance, undefined);
});

test("PASS_WITH_NOTE does not call revision and keeps text byte-for-byte", async () => {
  let revisionCalls = 0;
  const result = await runContentPipelineForCandidate(makeCandidate(), {
    eligibilityResult: "PASS",
    gatherFactsFn: async () => ({ ...testFactPack }),
    curatorFn: async () => ({ ...goodDraft }),
    reviewerFn: async () => ({
      verdict: "PASS_WITH_NOTE",
      issues: [],
      notes: ["Synopsis is mostly TMDB-derived; still usable."],
      summary: "Usable with note",
    }),
    revisionFn: async () => {
      revisionCalls += 1;
      return goodDraft;
    },
  });
  assert.equal(revisionCalls, 0);
  assert.equal(result.diagnostics.reviewer_verdict, "PASS_WITH_NOTE");
  assert.equal(result.content_revision_count, 0);
  assert.equal(result.synopsis, goodDraft.synopsis);
  assert.equal(result.content_status, DISCOVERY_CONTENT_STATUS.readyWithNote);
  assert.match(String(result.content_note), /TMDB overview/i);
});

test("FIX triggers exactly one targeted revision", async () => {
  let revisionCalls = 0;
  const revised = {
    ...goodDraft,
    synopsis:
      "In a coastal workshop, a repairman builds a wooden answering machine that unsettles his quiet routine.",
  };
  const result = await runContentPipelineForCandidate(makeCandidate(), {
    eligibilityResult: "PASS",
    gatherFactsFn: async () => ({ ...testFactPack }),
    curatorFn: async () => ({ ...goodDraft }),
    reviewerFn: async () => ({
      verdict: "FIX",
      issues: [
        {
          field: "synopsis",
          code: "ad_copy",
          detail: "Remove promotional tone in the second clause",
        },
      ],
      summary: "Needs a concrete fix",
    }),
    revisionFn: async () => {
      revisionCalls += 1;
      return revised;
    },
  });
  assert.equal(revisionCalls, 1);
  assert.equal(result.content_revision_count, 1);
  assert.equal(result.diagnostics.reviewer_verdict, "FIX");
  assert.equal(result.synopsis, revised.synopsis);
  assert.ok(
    [
      DISCOVERY_CONTENT_STATUS.ready,
      DISCOVERY_CONTENT_STATUS.readyWithNote,
    ].includes(result.content_status)
  );
});

test("missing curatorial value alone is not a FIX", async () => {
  let revisionCalls = 0;
  const result = await runContentPipelineForCandidate(makeCandidate(), {
    eligibilityResult: "PASS",
    gatherFactsFn: async () => ({ ...testFactPack }),
    curatorFn: async () => ({ ...goodDraft }),
    reviewerFn: async () => ({
      verdict: "FIX",
      issues: [
        {
          field: "synopsis",
          code: "CURATORIAL_VALUE",
          detail: "Add clearer curatorial value",
        },
      ],
      summary: "Needs more distinctive framing",
    }),
    revisionFn: async () => {
      revisionCalls += 1;
      return goodDraft;
    },
  });
  assert.equal(revisionCalls, 0);
  assert.equal(result.diagnostics.reviewer_verdict, "PASS_WITH_NOTE");
  assert.equal(result.synopsis, goodDraft.synopsis);
});

test("technique uncertainty creates note, not failure", () => {
  const policy = resolveTechniqueStatusPolicy({
    labels: [],
    diagnostics: [],
    nonBlockingUnknown: [],
    techniqueEvidence: [],
    wikipediaOnlyDistinctive: [],
  });
  assert.equal(policy.needsReview, false);
  assert.ok(policy.techniqueNotes.length >= 1);

  const validated = validateDiscoveryContentDraft(
    {
      synopsis: goodDraft.synopsis,
      the_mood: goodDraft.the_mood,
      technique: ["2D animation"],
      moods: goodDraft.moods,
    },
    { tmdbOverview: testFactPack.tmdbOverview, techniqueEvidence: [] }
  );
  assert.equal(validated.techniqueNeedsReview, false);
  assert.equal(validated.technique, null);
  assert.ok(
    validated.techniqueNotes.some((note) =>
      /could not be determined|left empty/i.test(note)
    ) ||
      validated.softNotes.some((note) =>
        /could not be determined|left empty/i.test(note)
      )
  );
});

test("unverified basic technique is not stored without evidence", () => {
  const normalized = normalizeDiscoveryTechniqueLabels(["2D animation"]);
  assert.equal(normalized.technique, "2D animation");
  const validated = validateDiscoveryContentDraft(
    {
      synopsis: goodDraft.synopsis,
      the_mood: goodDraft.the_mood,
      technique: ["2D animation"],
      moods: goodDraft.moods,
    },
    { tmdbOverview: testFactPack.tmdbOverview, techniqueEvidence: [] }
  );
  assert.equal(validated.technique, null);
  assert.equal(validated.techniqueNeedsReview, false);
});

test("evidence-backed distinctive drops sibling generic 2D", () => {
  const validated = validateDiscoveryContentDraft(
    {
      synopsis: goodDraft.synopsis,
      the_mood: goodDraft.the_mood,
      technique: ["2D animation", "rotoscope"],
      moods: goodDraft.moods,
    },
    {
      tmdbOverview: testFactPack.tmdbOverview,
      techniqueEvidence: [
        {
          label: "rotoscope",
          tier: "editorial",
          confidence: 0.8,
          distinctive: true,
          evidenceSummary: "rotoscoped live-action plates",
          sourceLabel: "test",
        },
      ],
    }
  );
  assert.equal(validated.technique, "rotoscope");
});

test("stop-motion aliases collapse to one canonical label", () => {
  const normalized = normalizeDiscoveryTechniqueLabels([
    "STOP-MOTION ANIMATION",
    "STOP MOTION",
  ]);
  assert.equal(normalized.technique, "stop-motion animation");
  assert.deepEqual(normalized.labels, ["stop-motion animation"]);
});

test("unsupported specific technique claim can still be a hard issue via reviewer FIX path", async () => {
  let revisionCalls = 0;
  const emptyTechniqueFacts = {
    ...testFactPack,
    techniqueEvidence: [],
    hasDirectTechniqueEvidence: false,
  };
  const result = await runContentPipelineForCandidate(makeCandidate(), {
    eligibilityResult: "PASS",
    gatherFactsFn: async () => ({ ...emptyTechniqueFacts }),
    curatorFn: async () => ({
      ...goodDraft,
      technique: ["hand-drawn animation"],
      technique_notes: null,
    }),
    reviewerFn: async () => ({
      verdict: "FIX",
      issues: [
        {
          field: "technique",
          code: "unsupported_claim",
          detail: "remove unsupported hand-drawn",
        },
      ],
      summary: "Unsupported technique claim",
    }),
    revisionFn: async (_c, draft) => {
      revisionCalls += 1;
      return { ...draft, technique: [] };
    },
  });
  assert.equal(revisionCalls, 1);
  assert.equal(result.technique, null);
});

test("batch repetition creates batch note but not revision", async () => {
  const analysis = analyzeBatchEditorialPatterns(
    Array.from({ length: 6 }, (_, index) => ({
      id: String(index),
      title: `Film ${index}`,
      skipped: false,
      synopsis: `Hero ${index} crosses a border after losing a home.`,
      the_mood: "Dark and tense, with cold pressure under every scene.",
      moods: ["dark", "tense", "bleak", "anxious"],
    }))
  );
  assert.ok(analysis.repeated_mood_openings.length >= 1);
  assert.equal(analysis.revision_targets.length, 0);
  assert.ok(analysis.batch_notes.length >= 1);
});

test("ready skipped without force", () => {
  assert.equal(
    isContentResumeEligible(
      { content_status: DISCOVERY_CONTENT_STATUS.ready },
      { force: false }
    ),
    false
  );
  assert.equal(
    isContentResumeEligible(
      { content_status: DISCOVERY_CONTENT_STATUS.readyWithNote },
      { force: false }
    ),
    false
  );
});

test("batch dry-run does not write films or email", async () => {
  let updates = 0;
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
      {
        id: "2",
        title: "B",
        year: 2021,
        directors: ["D"],
        countries: ["F"],
        eligibility_result: "PASS",
        content_status: DISCOVERY_CONTENT_STATUS.ready,
      },
    ],
    {
      dryRun: true,
      skipEmail: true,
      delayMs: 0,
      curateFn: async () => ({
        ...buildContentCandidatePatch({
          synopsis: goodDraft.synopsis,
          the_mood: goodDraft.the_mood,
          technique: "stop-motion animation",
          moods: goodDraft.moods,
          content_status: DISCOVERY_CONTENT_STATUS.ready,
          content_revision_count: 0,
        }),
        diagnostics: {
          reviewer_branch: "PASS",
          reviewer_verdict: DISCOVERY_CONTENT_VERDICT.pass,
          acceptance: "accepted_first_pass",
        },
      }),
      updateFn: async () => {
        updates += 1;
      },
    }
  );
  assert.equal(report.dryRun, true);
  assert.equal(report.databaseMutated, false);
  assert.equal(report.writes_to_films_table, false);
  assert.equal(report.email_sent, false);
  assert.equal(updates, 0);
  assert.equal(report.tallies.skipped, 1);
  assert.equal(report.tallies.would_update, 1);
});

test("content pipeline does not change identity / review / media flags", async () => {
  const result = await runContentPipelineForCandidate(
    makeCandidate({ title: "Keep", year: 2001 }),
    {
      eligibilityResult: "PASS",
      gatherFactsFn: async () => ({ ...testFactPack }),
      curatorFn: async () => ({ ...goodDraft }),
      reviewerFn: async () => ({
        verdict: "PASS",
        issues: [],
        notes: [],
        summary: "ok",
      }),
    }
  );
  assert.equal(result.identity_unchanged, true);
  assert.equal(result.review_status_unchanged, true);
  assert.equal(result.media_status_unchanged, true);
  assert.equal(result.writes_to_films_table, false);
});

test("workflow order: FAIL skips content; PASS can run content after media", async () => {
  let mediaCalls = 0;
  let contentCalls = 0;
  await runWeeklyFilmDiscovery({
    catalogFilms: [],
    existingCandidates: [],
    dryRun: true,
    skipEmail: true,
    targetCount: 1,
    maxRounds: 1,
    researcherFn: async () => ({
      candidates: [
        makeCandidate({ title: "No Sources", year: 1999, source_urls: [] }),
      ],
    }),
    mediaCuratorFn: async () => {
      mediaCalls += 1;
      return { media_status: "media_complete" };
    },
    contentCuratorFn: async () => {
      contentCalls += 1;
      return { content_status: DISCOVERY_CONTENT_STATUS.ready };
    },
  });
  assert.equal(mediaCalls, 0);
  assert.equal(contentCalls, 0);

  const ok = await runWeeklyFilmDiscovery({
    catalogFilms: [],
    existingCandidates: [],
    dryRun: true,
    skipEmail: true,
    targetCount: 1,
    maxRounds: 1,
    researcherFn: async () => ({
      candidates: [makeCandidate({ title: "Ok Film", year: 2005 })],
    }),
    mediaCuratorFn: async () => {
      mediaCalls += 1;
      return { media_status: "media_complete", poster_url: "https://x/p.jpg" };
    },
    contentCuratorFn: async () => {
      contentCalls += 1;
      return {
        content_status: DISCOVERY_CONTENT_STATUS.ready,
        synopsis: goodDraft.synopsis,
        the_mood: goodDraft.the_mood,
        technique: "2D animation",
      };
    },
  });
  assert.equal(mediaCalls, 1);
  assert.equal(contentCalls, 1);
  assert.equal(ok.passed[0].content_status, DISCOVERY_CONTENT_STATUS.ready);
});

test("email includes content status without full texts", () => {
  const email = formatWeeklyFilmDiscoveryEmail({
    brief: {
      summary: "x",
      priorityCountries: [],
      priorityYearsOrDecades: [],
      priorityGenresOrThemes: [],
      priorityTechniques: [],
      overrepresented: [],
      underrepresented: [],
      batchRequirements: [],
    },
    researchRounds: 1,
    incomplete: false,
    passed: [
      {
        title: "Sample",
        year: 2020,
        directors: ["D"],
        countries: ["F"],
        runtime_minutes: 90,
        manager_why: "m",
        researcher_why: "r",
        eligibility_result: "PASS",
        media_status: "media_complete",
        content_status: "ready",
        content_note: "Mood wording is somewhat generic.",
        synopsis: "A long synopsis that should not flood the email body.",
        source_urls: ["https://example.com"],
      },
    ],
    failed: [],
  });
  assert.match(email.text, /\bready\b/);
  assert.match(email.text, /Content note:/);
  assert.doesNotMatch(email.text, /A long synopsis that should not flood/);
});

test("resolveContentAcceptance labels", () => {
  assert.equal(
    resolveContentAcceptance({
      revisionCount: 0,
      verdict: "PASS",
      status: "ready",
    }),
    "accepted_first_pass"
  );
  assert.equal(
    resolveContentAcceptance({
      revisionCount: 0,
      verdict: "PASS_WITH_NOTE",
      status: "ready_with_note",
      hasNotes: true,
    }),
    "pass_with_notes"
  );
});

test("FAIL eligibility never enriches content", async () => {
  const result = await runContentPipelineForCandidate(makeCandidate(), {
    eligibilityResult: DISCOVERY_ELIGIBILITY.fail,
    curatorFn: async () => goodDraft,
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "eligibility_not_pass");
});

test("failed only when usable text is missing", async () => {
  const result = await runContentPipelineForCandidate(makeCandidate(), {
    eligibilityResult: "PASS",
    gatherFactsFn: async () => ({ ...testFactPack }),
    curatorFn: async () => null,
  });
  assert.equal(result.content_status, DISCOVERY_CONTENT_STATUS.failed);
  assert.equal(result.content_note, "Content draft incomplete.");
});

test("composeContentNote merges into short human notes", () => {
  const note = composeContentNote([
    "Synopsis closely matches TMDB overview and could be seen as TMDB-heavy.",
    "Technique could not be determined from sources; left empty for manual review.",
    "the_mood uses a generic adjective (quirky/dreamlike/reflective)",
  ]);
  assert.match(note, /TMDB overview/);
  assert.match(note, /could not be determined/i);
  assert.match(note, /generic/);
});

test("buildContentCandidatePatch keeps only permanent fields", () => {
  const patch = buildContentCandidatePatch({
    synopsis: "s",
    the_mood: "m",
    technique: "2D animation",
    moods: ["quiet"],
    aesthetic_tags: ["handmade", "tactile", "sketch-like", "flat decorative world"],
    content_status: "ready",
    content_note: "Mood wording is somewhat generic.",
    content_revision_count: 0,
  });
  assert.equal(patch.content_note, "Mood wording is somewhat generic.");
  assert.equal(patch.content_status, "ready");
  assert.deepEqual(patch.aesthetic_tags, [
    "handmade",
    "tactile",
    "sketch-like",
    "flat decorative world",
  ]);
  assert.equal(patch.content_notes, undefined);
  assert.equal(patch.copy_notes, undefined);
  assert.equal(patch.content_provenance, undefined);
  assert.equal(patch.content_reviewer_verdict, undefined);
  assert.equal(patch.content_attempts, undefined);
});
