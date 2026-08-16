import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISCOVERY_ELIGIBILITY,
  DISCOVERY_MAX_RESEARCH_ROUNDS,
  DISCOVERY_REVIEW_STATUS,
  DISCOVERY_TARGET_CANDIDATE_COUNT,
} from "./film-discovery.mjs";
import {
  allowIncompleteBatch,
  normalizeResearcherCandidate,
  remainingCandidatesNeeded,
  researcherRequiresSources,
  reviewCandidateEligibility,
} from "./film-discovery-eligibility.mjs";
import { buildManagerBriefFromAnalytics } from "./film-discovery-manager.mjs";
import {
  buildApproveCandidatePatch,
  buildRejectCandidatePatch,
  filterAlreadyReviewedCandidates,
  isDiscoveryCandidatePublic,
  runWeeklyFilmDiscovery,
} from "./film-discovery-workflow.mjs";
import {
  loadMinimalDiscoverySchema,
  runMinimalDiscoveryImport,
  validateMinimalDiscoveryBatch,
} from "./film-discovery-minimal-import.mjs";
import { formatWeeklyFilmDiscoveryEmail } from "./film-discovery-email.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  root,
  "examples/imports/film-discovery-minimal-50.fixture.json"
);

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

test("Researcher cannot pass a film without sources", () => {
  const candidate = makeCandidate({ source_urls: [] });
  assert.equal(researcherRequiresSources(candidate), false);
  const review = reviewCandidateEligibility(candidate, { catalogFilms: [] });
  assert.equal(review.result, DISCOVERY_ELIGIBILITY.fail);
  assert.ok(review.reasons.some((reason) => /source/i.test(reason)));
});

test("Eligibility reviewer can reject a candidate", () => {
  const candidate = makeCandidate({ runtime_minutes: 12 });
  const review = reviewCandidateEligibility(candidate);
  assert.equal(review.result, DISCOVERY_ELIGIBILITY.fail);
  assert.ok(review.reasons.some((reason) => /runtime/i.test(reason)));
  assert.ok(review.fix_hints.length > 0);
});

test("maximum three research rounds", async () => {
  let calls = 0;
  const report = await runWeeklyFilmDiscovery({
    catalogFilms: [],
    existingCandidates: [],
    dryRun: true,
    skipEmail: true,
    maxRounds: DISCOVERY_MAX_RESEARCH_ROUNDS,
    researcherFn: async () => {
      calls += 1;
      return {
        candidates: [
          makeCandidate({
            title: `Fail Film ${calls}`,
            year: 2000 + calls,
            source_urls: [],
          }),
        ],
      };
    },
  });
  assert.equal(calls, DISCOVERY_MAX_RESEARCH_ROUNDS);
  assert.equal(report.batch.research_rounds, DISCOVERY_MAX_RESEARCH_ROUNDS);
  assert.equal(report.batch.passed_count, 0);
  assert.equal(report.batch.incomplete, true);
});

test("incomplete batch allowed after third round", () => {
  assert.equal(
    allowIncompleteBatch({
      round: 3,
      passedCount: 4,
      target: DISCOVERY_TARGET_CANDIDATE_COUNT,
    }),
    true
  );
  assert.equal(
    allowIncompleteBatch({
      round: 2,
      passedCount: 4,
      target: DISCOVERY_TARGET_CANDIDATE_COUNT,
    }),
    false
  );
  assert.equal(remainingCandidatesNeeded(4, 10), 6);
});

test("duplicates of existing catalog films fail eligibility", () => {
  const candidate = makeCandidate({
    title: "Existing Title",
    year: 2015,
  });
  const review = reviewCandidateEligibility(candidate, {
    catalogFilms: [{ title: "Existing Title", year: 2015 }],
  });
  assert.equal(review.result, DISCOVERY_ELIGIBILITY.fail);
  assert.ok(review.reasons.some((reason) => /duplicate/i.test(reason)));
});

test("pending/approved candidates are never public catalog films", () => {
  assert.equal(
    isDiscoveryCandidatePublic({
      review_status: DISCOVERY_REVIEW_STATUS.pendingReview,
    }),
    false
  );
  assert.equal(
    isDiscoveryCandidatePublic({
      review_status: DISCOVERY_REVIEW_STATUS.approved,
    }),
    false
  );
});

test("approve does not publish or enrich", () => {
  const patch = buildApproveCandidatePatch({
    review_status: DISCOVERY_REVIEW_STATUS.pendingReview,
  });
  assert.equal(patch.review_status, DISCOVERY_REVIEW_STATUS.approved);
  assert.equal(patch.publish, false);
  assert.equal(patch.enrich, false);
  assert.equal(patch.insert_into_films, false);
  assert.equal(patch.catalog_visible, false);
});

test("reject is persisted on patch", () => {
  const patch = buildRejectCandidatePatch(
    { review_status: DISCOVERY_REVIEW_STATUS.pendingReview },
    "Too commercial"
  );
  assert.equal(patch.review_status, DISCOVERY_REVIEW_STATUS.rejected);
  assert.equal(patch.reject_reason, "Too commercial");
  assert.ok(patch.reviewed_at);
});

test("weekly workflow skips already reviewed films via exclude list", async () => {
  const existing = filterAlreadyReviewedCandidates([
    {
      title: "Already Pending",
      year: 2019,
      review_status: DISCOVERY_REVIEW_STATUS.pendingReview,
    },
    {
      title: "Already Approved",
      year: 2018,
      review_status: DISCOVERY_REVIEW_STATUS.approved,
    },
    {
      title: "Already Rejected",
      year: 2017,
      review_status: DISCOVERY_REVIEW_STATUS.rejected,
    },
  ]);
  assert.equal(existing.length, 3);

  const report = await runWeeklyFilmDiscovery({
    catalogFilms: [],
    existingCandidates: existing,
    dryRun: true,
    skipEmail: true,
    maxRounds: 1,
    targetCount: 1,
    researcherFn: async () => ({
      candidates: [
        makeCandidate({ title: "Already Pending", year: 2019 }),
      ],
    }),
  });
  assert.equal(report.batch.passed_count, 0);
  assert.ok(
    report.failed.some((item) => /duplicate/i.test(item.reasons.join(" ")))
  );
});

test("manager brief builds from analytics without picking films", () => {
  const brief = buildManagerBriefFromAnalytics([
    {
      title: "A",
      year: 2010,
      country: "France",
      technique: "2D",
      moods: ["melancholy"],
      aesthetic_tags: ["painterly"],
      narrative_tags: ["road"],
    },
    {
      title: "B",
      year: 2011,
      country: "France",
      technique: "2D",
      moods: ["melancholy"],
      aesthetic_tags: ["painterly"],
      narrative_tags: ["road"],
    },
  ]);
  assert.ok(brief.summary);
  assert.ok(Array.isArray(brief.priorityCountries));
  assert.ok(Array.isArray(brief.underrepresented));
});

test("email includes manager brief and candidate fields", () => {
  const email = formatWeeklyFilmDiscoveryEmail({
    brief: {
      summary: "Need Eastern Europe",
      priorityCountries: ["Poland"],
      priorityYearsOrDecades: ["1990s"],
      priorityGenresOrThemes: ["melancholy"],
      priorityTechniques: ["stop-motion"],
      overrepresented: ["country:France"],
      underrepresented: ["country:Poland"],
      batchRequirements: ["Expand coverage for Poland"],
    },
    researchRounds: 2,
    incomplete: false,
    rejectionSummary: [{ reason: "No sources", count: 1 }],
    passed: [
      {
        title: "Sample",
        original_title: "Sample OT",
        year: 2020,
        directors: ["Dir"],
        countries: ["Poland"],
        runtime_minutes: 88,
        manager_why: "Region gap",
        researcher_why: "Fits brief",
        eligibility_result: "PASS",
        source_urls: ["https://example.com"],
      },
    ],
    failed: [],
  });
  assert.match(email.subject, /Weekly film discovery/i);
  assert.match(email.text, /Manager brief/);
  assert.match(email.text, /Sample OT/);
  assert.match(email.text, /Region gap/);
  assert.match(email.text, /https:\/\/example.com/);
});

test("batch of 50 passes minimal schema validation", async () => {
  const schema = await loadMinimalDiscoverySchema();
  const batch = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  const result = validateMinimalDiscoveryBatch(batch, schema);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.filmCount, 50);
});

function minimalFilm(overrides = {}) {
  return {
    title: "Some Feature",
    original_title: "Some Feature",
    year: 2016,
    directors: ["Director"],
    countries: ["South Korea"],
    runtime_minutes: 90,
    ...overrides,
  };
}

test("different non-Latin original_title same year are not duplicates", async () => {
  const schema = await loadMinimalDiscoverySchema();
  const result = validateMinimalDiscoveryBatch(
    {
      batch_name: "non-latin-distinct",
      films: [
        minimalFilm({
          title: "Seoul Station",
          original_title: "서울역",
          year: 2016,
        }),
        minimalFilm({
          title: "The Senior Class",
          original_title: "졸업반",
          year: 2016,
        }),
      ],
    },
    schema
  );
  assert.equal(result.ok, true, result.errors.join("; "));
});

test("identical raw non-Latin original_title same year is still a duplicate", async () => {
  const schema = await loadMinimalDiscoverySchema();
  const result = validateMinimalDiscoveryBatch(
    {
      batch_name: "non-latin-same-raw",
      films: [
        minimalFilm({
          title: "Film A",
          original_title: "졸업반",
          year: 2016,
        }),
        minimalFilm({
          title: "Film B",
          original_title: "졸업반",
          year: 2016,
        }),
      ],
    },
    schema
  );
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((err) => /duplicate original_title\+year/i.test(err))
  );
});

test("Latin original_title + year still detects duplicates", async () => {
  const schema = await loadMinimalDiscoverySchema();
  const result = validateMinimalDiscoveryBatch(
    {
      batch_name: "latin-original-dupe",
      films: [
        minimalFilm({
          title: "English Title One",
          original_title: "Le Magasin des suicides",
          year: 2012,
        }),
        minimalFilm({
          title: "English Title Two",
          original_title: "Le Magasin Des Suicides",
          year: 2012,
        }),
      ],
    },
    schema
  );
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((err) => /duplicate original_title\+year/i.test(err))
  );
});

test("title + year still detects duplicates", async () => {
  const schema = await loadMinimalDiscoverySchema();
  const result = validateMinimalDiscoveryBatch(
    {
      batch_name: "title-year-dupe",
      films: [
        minimalFilm({
          title: "Fritz the Cat",
          original_title: "Fritz the Cat",
          year: 1972,
        }),
        minimalFilm({
          title: "The Fritz the Cat",
          original_title: "Autre titre",
          year: 1972,
        }),
      ],
    },
    schema
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((err) => /duplicate title\+year/i.test(err)));
});

test("minimal import does not write forbidden extra fields", async () => {
  const schema = await loadMinimalDiscoverySchema();
  const batch = {
    batch_name: "tiny",
    films: [
      {
        title: "Tiny Seed",
        original_title: "Tiny Seed",
        year: 2022,
        directors: ["D"],
        countries: ["Japan"],
        runtime_minutes: 80,
      },
    ],
  };
  const result = await runMinimalDiscoveryImport({
    batch,
    schema,
    dryRun: true,
    catalogFilms: [],
    existingCandidates: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.databaseMutated, false);
  const row = result.plan.rows[0];
  assert.equal(row.synopsis, undefined);
  assert.equal(row.the_mood, undefined);
  assert.equal(row.technique, undefined);
  assert.equal(row.festival_recognitions, undefined);
  assert.deepEqual(row.source_urls, []);
  assert.equal(row.title, "Tiny Seed");
  assert.deepEqual(row.directors, ["D"]);
  assert.deepEqual(row.countries, ["Japan"]);
  assert.equal(row.runtime_minutes, 80);
  assert.equal(result.plan.writes_to_films_table, false);
  assert.equal(result.plan.appears_in_public_catalog, false);

  const withExtras = {
    batch_name: "bad",
    films: [
      {
        ...batch.films[0],
        synopsis: "should be rejected",
      },
    ],
  };
  const invalid = validateMinimalDiscoveryBatch(withExtras, schema);
  assert.equal(invalid.ok, false);
  assert.ok(
    invalid.errors.some(
      (err) => /synopsis|additional|forbid/i.test(err)
    )
  );
});

test("dry run does not mutate database even with insertFn present", async () => {
  const schema = await loadMinimalDiscoverySchema();
  const batch = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  let insertCalled = false;
  const result = await runMinimalDiscoveryImport({
    batch,
    schema,
    dryRun: true,
    catalogFilms: [],
    existingCandidates: [],
    insertFn: async () => {
      insertCalled = true;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.databaseMutated, false);
  assert.equal(insertCalled, false);
  assert.equal(result.plan.would_insert, 50);
});

test("workflow can pass eligible candidates within one round", async () => {
  const candidates = Array.from({ length: 10 }, (_, index) =>
    makeCandidate({
      title: `Pass Film ${index + 1}`,
      year: 2010 + index,
      source_urls: [`https://example.com/${index + 1}`],
    })
  );
  const report = await runWeeklyFilmDiscovery({
    catalogFilms: [],
    existingCandidates: [],
    dryRun: true,
    skipEmail: true,
    researcherFn: async () => ({ candidates }),
  });
  assert.equal(report.batch.passed_count, 10);
  assert.equal(report.batch.incomplete, false);
  assert.equal(report.batch.research_rounds, 1);
  assert.ok(
    report.passed.every(
      (row) => row.review_status === DISCOVERY_REVIEW_STATUS.pendingReview
    )
  );
});
