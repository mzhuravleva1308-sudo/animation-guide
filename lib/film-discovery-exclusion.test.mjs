import assert from "node:assert/strict";
import test from "node:test";
import {
  DISCOVERY_ELIGIBILITY,
  DISCOVERY_REJECT_REASON,
  DISCOVERY_REVIEW_STATUS,
} from "./film-discovery.mjs";
import {
  buildExclusionEntriesFromCandidates,
  buildExclusionEntriesFromFilms,
  estimatePromptSize,
  filterResearcherCandidatesAgainstIndex,
  formatExclusionIndexForResearcher,
  formatExclusionListForPrompt,
  hasNewSourceEvidence,
  matchAgainstExclusionIndex,
  mergeExclusionIndexes,
  normalizeDiscoveryIdentityString,
  summarizeExclusionIndexSources,
} from "./film-discovery-exclusion.mjs";
import {
  buildResearcherPrompt,
  normalizeResearcherCandidate,
  reviewCandidateEligibility,
} from "./film-discovery-eligibility.mjs";
import {
  buildRoundExclusionIndex,
  runWeeklyFilmDiscovery,
} from "./film-discovery-workflow.mjs";

function makeEvidence(overrides = {}) {
  return {
    full_length_feature: "Runtime 90 minutes feature",
    fully_animated: "Stop-motion throughout",
    no_live_action_or_archive: "No live-action or archive inserts",
    not_children_oriented: "Adult festival drama",
    independent_auteur_or_festival: "Annecy competition",
    not_in_catalog: "Checked against catalog dump",
    standalone_release: "Theatrical feature release",
    reliable_sources: "IMDb + festival page",
    ...overrides,
  };
}

function makeCandidate(overrides = {}) {
  return normalizeResearcherCandidate({
    title: "Unique Discovery Film",
    original_title: "Unique Discovery Film",
    year: 2021,
    directors: ["Ada Director"],
    countries: ["Chile"],
    runtime_minutes: 92,
    source_urls: ["https://example.com/film"],
    researcher_why: "Fills Latin America gap",
    manager_why: "Underrepresented region",
    requirement_evidence: makeEvidence(),
    ...overrides,
  });
}

test("1. film from films is filtered out of Researcher results", () => {
  const index = buildExclusionEntriesFromFilms([
    { title: "Seoul Station", original_title: "서울역", year: 2016 },
  ]);
  const { accepted, rejected } = filterResearcherCandidatesAgainstIndex(
    [
      makeCandidate({
        title: "Seoul Station",
        original_title: "서울역",
        year: 2016,
      }),
    ],
    index
  );
  assert.equal(accepted.length, 0);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, DISCOVERY_REJECT_REASON.duplicate);
  assert.equal(rejected[0].matched.source, "films");
});

test("2. pending_review candidate is not re-proposed", () => {
  const index = buildExclusionEntriesFromCandidates([
    {
      title: "Pending Film",
      original_title: "Pending Film",
      year: 2019,
      review_status: DISCOVERY_REVIEW_STATUS.pendingReview,
      source_urls: ["https://example.com/a"],
    },
  ]);
  const { accepted } = filterResearcherCandidatesAgainstIndex(
    [makeCandidate({ title: "Pending Film", year: 2019 })],
    index
  );
  assert.equal(accepted.length, 0);
});

test("3. approved candidate is not re-proposed", () => {
  const index = buildExclusionEntriesFromCandidates([
    {
      title: "Approved Film",
      year: 2018,
      review_status: DISCOVERY_REVIEW_STATUS.approved,
    },
  ]);
  const { accepted } = filterResearcherCandidatesAgainstIndex(
    [makeCandidate({ title: "Approved Film", year: 2018 })],
    index
  );
  assert.equal(accepted.length, 0);
});

test("4. permanently rejected candidate is not re-proposed", () => {
  const index = buildExclusionEntriesFromCandidates([
    {
      title: "Kids Film",
      year: 2015,
      review_status: DISCOVERY_REVIEW_STATUS.rejected,
      reject_reason: DISCOVERY_REJECT_REASON.primarilyForChildren,
    },
  ]);
  const { accepted } = filterResearcherCandidatesAgainstIndex(
    [makeCandidate({ title: "Kids Film", year: 2015 })],
    index
  );
  assert.equal(accepted.length, 0);
});

test("5. retriable rejected without new sources stays excluded", () => {
  const index = buildExclusionEntriesFromCandidates([
    {
      title: "Sparse Sources",
      year: 2014,
      review_status: DISCOVERY_REVIEW_STATUS.rejected,
      reject_reason: DISCOVERY_REJECT_REASON.insufficientSources,
      source_urls: ["https://example.com/old"],
    },
  ]);
  const { accepted, rejected } = filterResearcherCandidatesAgainstIndex(
    [
      makeCandidate({
        title: "Sparse Sources",
        year: 2014,
        source_urls: ["https://example.com/old"],
      }),
    ],
    index
  );
  assert.equal(accepted.length, 0);
  assert.equal(rejected.length, 1);
});

test("6. retriable rejected may return with a new confirmed source", () => {
  const index = buildExclusionEntriesFromCandidates([
    {
      title: "Sparse Sources",
      year: 2014,
      review_status: DISCOVERY_REVIEW_STATUS.rejected,
      reject_reason: DISCOVERY_REJECT_REASON.insufficientSources,
      source_urls: ["https://example.com/old"],
    },
  ]);
  assert.equal(
    hasNewSourceEvidence(
      ["https://example.com/old", "https://example.com/new"],
      ["https://example.com/old"]
    ),
    true
  );
  const { accepted, rejected } = filterResearcherCandidatesAgainstIndex(
    [
      makeCandidate({
        title: "Sparse Sources",
        year: 2014,
        source_urls: ["https://example.com/old", "https://example.com/new"],
      }),
    ],
    index
  );
  assert.equal(rejected.length, 0);
  assert.equal(accepted.length, 1);
});

test("7. candidate found in round 1 is not repeated in round 2", async () => {
  let round = 0;
  const report = await runWeeklyFilmDiscovery({
    catalogFilms: [],
    existingCandidates: [],
    dryRun: true,
    skipEmail: true,
    maxRounds: 2,
    targetCount: 2,
    researcherFn: async () => {
      round += 1;
      if (round === 1) {
        return {
          candidates: [
            makeCandidate({ title: "Round One Film", year: 2001 }),
          ],
        };
      }
      // Intentionally re-propose the same film in round 2
      return {
        candidates: [
          makeCandidate({ title: "Round One Film", year: 2001 }),
          makeCandidate({ title: "Round Two Film", year: 2002 }),
        ],
      };
    },
  });
  assert.equal(report.batch.passed_count, 2);
  assert.equal(
    report.passed.filter((row) => row.title === "Round One Film").length,
    1
  );
  assert.ok(
    report.failed.some(
      (row) =>
        row.title === "Round One Film" &&
        row.reason_code === DISCOVERY_REJECT_REASON.duplicate
    )
  );
});

test("8. Eligibility catches a duplicate Researcher missed", () => {
  const review = reviewCandidateEligibility(
    makeCandidate({ title: "Catalog Hit", year: 2010 }),
    {
      catalogFilms: [{ title: "Catalog Hit", year: 2010 }],
    }
  );
  assert.equal(review.result, DISCOVERY_ELIGIBILITY.fail);
  assert.equal(review.reason_code, DISCOVERY_REJECT_REASON.duplicate);
  assert.equal(review.matched_record.title, "Catalog Hit");
  assert.equal(review.matched_record.source, "films");
  assert.equal(review.matched_record.year, 2010);
});

test("9. different non-Latin original titles same year are not duplicates", () => {
  const index = buildExclusionEntriesFromFilms([
    { title: "Seoul Station", original_title: "서울역", year: 2016 },
  ]);
  const { hard } = matchAgainstExclusionIndex(
    {
      title: "The Senior Class",
      original_title: "졸업반",
      year: 2016,
    },
    index
  );
  assert.equal(hard, null);
  assert.ok(normalizeDiscoveryIdentityString("서울역"));
  assert.ok(normalizeDiscoveryIdentityString("졸업반"));
  assert.notEqual(
    normalizeDiscoveryIdentityString("서울역"),
    normalizeDiscoveryIdentityString("졸업반")
  );
});

test("10. identical Unicode original_title + year is a duplicate", () => {
  const index = buildExclusionEntriesFromFilms([
    { title: "Film A", original_title: "졸업반", year: 2016 },
  ]);
  const { hard } = matchAgainstExclusionIndex(
    { title: "Film B", original_title: "졸업반", year: 2016 },
    index
  );
  assert.ok(hard);
  assert.equal(hard.kind, "unicode_original_title_year");
});

test("11. empty normalized original_title is not a duplicate key", () => {
  // Space-only / punctuation-only originals normalize empty and must not collide
  const index = buildExclusionEntriesFromFilms([
    { title: "Alpha", original_title: "!!!", year: 2000 },
  ]);
  const { hard } = matchAgainstExclusionIndex(
    { title: "Beta", original_title: "???", year: 2000 },
    index
  );
  assert.equal(normalizeDiscoveryIdentityString("!!!"), "");
  assert.equal(hard, null);
});

test("12. title + year dedupe still works", () => {
  const index = buildExclusionEntriesFromFilms([
    { title: "Fritz the Cat", year: 1972 },
  ]);
  const { hard } = matchAgainstExclusionIndex(
    { title: "The Fritz the Cat", year: 1972 },
    index
  );
  assert.ok(hard);
  assert.equal(hard.kind, "title_year");
});

test("13. fuzzy match alone does not reject — needs additional check", () => {
  const near = makeCandidate({
    title: "Free Jimmy Now",
    original_title: "Free Jimmy Now",
    year: 2006,
  });
  const review = reviewCandidateEligibility(near, {
    catalogFilms: [
      {
        title: "Free Jimmy",
        original_title: "Free Jimmy",
        year: 2006,
      },
    ],
  });
  // Strong word overlap → fuzzy signal, but not automatic FAIL / not duplicate
  assert.equal(review.result, DISCOVERY_ELIGIBILITY.pass);
  assert.equal(review.reason_code, null);
  assert.equal(review.matched_record, null);
  assert.ok(review.evidence.fuzzy_needs_review);
  assert.ok(
    review.fix_hints.some((hint) => /additional verification/i.test(hint))
  );
});

test("exclusion index compact format for Researcher", () => {
  const index = mergeExclusionIndexes(
    buildExclusionEntriesFromFilms([
      { title: "Seoul Station", original_title: "서울역", year: 2016 },
    ]),
    buildExclusionEntriesFromCandidates([
      {
        title: "Pending",
        year: 2020,
        review_status: DISCOVERY_REVIEW_STATUS.pendingReview,
      },
    ])
  );
  const compact = formatExclusionIndexForResearcher(index);
  assert.deepEqual(Object.keys(compact[0]).sort(), [
    "aliases",
    "original_title",
    "source",
    "title",
    "year",
  ]);
  assert.equal(compact[0].source, "films");
  assert.equal(compact[0].original_title, "서울역");
});

test("Researcher prompt includes all films and required staging/run entries", () => {
  const films = [
    { title: "Funan", original_title: "Funan", year: 2018, synopsis: "SECRET" },
    {
      title: "Seoul Station",
      original_title: "서울역",
      year: 2016,
      the_mood: "SECRET",
      directors: ["Yeon"],
      countries: ["South Korea"],
    },
  ];
  const staging = [
    {
      title: "Pending Film",
      original_title: "Pending OT",
      year: 2019,
      review_status: DISCOVERY_REVIEW_STATUS.pendingReview,
    },
    {
      title: "Approved Film",
      year: 2018,
      review_status: DISCOVERY_REVIEW_STATUS.approved,
    },
    {
      title: "Kids Rejected",
      year: 2015,
      review_status: DISCOVERY_REVIEW_STATUS.rejected,
      reject_reason: DISCOVERY_REJECT_REASON.primarilyForChildren,
    },
  ];
  const index = buildRoundExclusionIndex({
    catalogFilms: films,
    existingCandidates: staging,
    passed: [
      {
        candidate: makeCandidate({
          title: "Round One Keep",
          original_title: "Round One Keep",
          year: 2001,
        }),
        review: { result: "PASS", reasons: [] },
      },
    ],
    failed: [],
  });

  const prompt = buildResearcherPrompt({
    brief: {
      summary: "test",
      priorityCountries: [],
      priorityYearsOrDecades: [],
      priorityGenresOrThemes: [],
      priorityTechniques: [],
      overrepresented: [],
      underrepresented: [],
      batchRequirements: [],
    },
    exclusionIndex: index,
    needed: 10,
    round: 2,
  });

  const filmsInIndex = index.filter((e) => e.source === "films");
  assert.equal(filmsInIndex.length, 2);
  assert.match(prompt, /- Funan \/ Funan \(2018\)/);
  assert.match(prompt, /- Seoul Station \/ 서울역 \(2016\)/);
  assert.equal(
    (prompt.match(/- Funan \/ Funan \(2018\)/g) ?? []).length,
    1
  );
  // count of films lines equals films in exclusion index
  for (const film of filmsInIndex) {
    assert.ok(prompt.includes(`- ${film.title}`));
    if (film.original_title) {
      assert.ok(prompt.includes(film.original_title));
    }
  }

  assert.match(prompt, /- Pending Film \/ Pending OT \(2019\)/);
  assert.match(prompt, /- Approved Film \(2018\)/);
  assert.match(prompt, /- Kids Rejected \(2015\)/);
  assert.match(prompt, /- Round One Keep \/ Round One Keep \(2001\)/);
  assert.match(
    prompt,
    /Do not propose any film appearing in the exclusion list\. Check both English and original titles, including translated and alternative spellings\./
  );

  assert.doesNotMatch(prompt, /SECRET/);
  assert.doesNotMatch(prompt, /\bYeon\b/);
  assert.doesNotMatch(prompt, /South Korea/);
  // Exclusion lines must not embed card fields
  const exclusionBlock = prompt.slice(
    prompt.indexOf("Exclusion list"),
    prompt.indexOf("Round:")
  );
  assert.doesNotMatch(exclusionBlock, /synopsis|the_mood|directors|countries|runtime/i);
  assert.ok(prompt.includes("서울역"));

  const size = estimatePromptSize(prompt);
  assert.ok(size.characters > 0);
  assert.ok(size.estimated_tokens > 0);

  const summary = summarizeExclusionIndexSources(index);
  assert.equal(summary.films, 2);
  assert.equal(summary.staging, 3);
  assert.equal(summary.workflow_round, 1);
  assert.equal(summary.total, 6);
});

test("programmatic duplicate filter still works after prompt change", () => {
  const index = buildExclusionEntriesFromFilms([
    { title: "Seoul Station", original_title: "서울역", year: 2016 },
  ]);
  const { accepted } = filterResearcherCandidatesAgainstIndex(
    [
      makeCandidate({
        title: "Seoul Station",
        original_title: "서울역",
        year: 2016,
      }),
    ],
    index
  );
  assert.equal(accepted.length, 0);
});

test("Eligibility still independently catches duplicates", () => {
  const review = reviewCandidateEligibility(
    makeCandidate({ title: "Catalog Hit", year: 2010 }),
    { catalogFilms: [{ title: "Catalog Hit", year: 2010 }] }
  );
  assert.equal(review.result, DISCOVERY_ELIGIBILITY.fail);
  assert.equal(review.reason_code, DISCOVERY_REJECT_REASON.duplicate);
});

test("buildRoundExclusionIndex includes catalog, staging, passed, permanent fails", () => {
  const index = buildRoundExclusionIndex({
    catalogFilms: [{ title: "Cat", year: 2001 }],
    existingCandidates: [
      {
        title: "Pending",
        year: 2002,
        review_status: DISCOVERY_REVIEW_STATUS.pendingReview,
      },
    ],
    passed: [
      {
        candidate: makeCandidate({ title: "Passed", year: 2003 }),
        review: { result: "PASS", reasons: [] },
      },
    ],
    failed: [
      {
        candidate: makeCandidate({ title: "Dup", year: 2004 }),
        review: {
          result: "FAIL",
          reason_code: DISCOVERY_REJECT_REASON.duplicate,
          matched_record: { title: "X", year: 2004, source: "films" },
          reasons: ["duplicate"],
        },
      },
    ],
  });
  const titles = index.map((entry) => entry.title);
  assert.ok(titles.includes("Cat"));
  assert.ok(titles.includes("Pending"));
  assert.ok(titles.includes("Passed"));
  assert.ok(titles.includes("Dup"));
});
