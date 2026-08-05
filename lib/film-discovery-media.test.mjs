import assert from "node:assert/strict";
import test from "node:test";
import {
  DISCOVERY_ELIGIBILITY,
  DISCOVERY_MEDIA_STATUS,
} from "./film-discovery.mjs";
import {
  buildMediaCandidatePatch,
  buildPosterFromTmdbMovie,
  isMediaResumeEligible,
  resolveMediaStatus,
  runDiscoveryMediaBatch,
  runMediaCuratorForCandidate,
  shouldAttemptMediaLookup,
  shouldRunMediaCurator,
} from "./film-discovery-media.mjs";
import { formatWeeklyFilmDiscoveryEmail } from "./film-discovery-email.mjs";
import { runWeeklyFilmDiscovery } from "./film-discovery-workflow.mjs";
import { normalizeResearcherCandidate } from "./film-discovery-eligibility.mjs";

function makeEvidence() {
  return {
    full_length_feature: "90m feature",
    fully_animated: "animation",
    no_live_action_or_archive: "none",
    not_children_oriented: "adult",
    independent_auteur_or_festival: "festival",
    not_in_catalog: "checked",
    standalone_release: "feature",
    reliable_sources: "sources",
  };
}

function makeCandidate(overrides = {}) {
  return normalizeResearcherCandidate({
    title: "Media Film",
    original_title: "Media Film",
    year: 2020,
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

test("1. Media curator runs only after Eligibility PASS", () => {
  assert.equal(shouldRunMediaCurator({ result: "PASS" }), true);
  assert.equal(shouldRunMediaCurator({ eligibility_result: "PASS" }), true);
  assert.equal(shouldRunMediaCurator({ result: "FAIL" }), false);
});

test("2. FAIL candidate does not receive media enrichment", async () => {
  const result = await runMediaCuratorForCandidate(makeCandidate(), {
    eligibilityResult: DISCOVERY_ELIGIBILITY.fail,
    findPoster: async () => ({ poster_url: "https://example.com/p.jpg" }),
    findTrailer: async () => ({ url: "https://youtube.com/watch?v=abc" }),
  });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, "eligibility_not_pass");
  assert.equal(result.writes_to_films_table, false);
});

test("3. Media curator does not change identity fields", async () => {
  const candidate = makeCandidate({ title: "Keep Title", year: 2011 });
  const result = await runMediaCuratorForCandidate(candidate, {
    eligibilityResult: "PASS",
    findPoster: async () => ({
      poster_url: "https://image.tmdb.org/t/p/w500/x.jpg",
      poster_source_label: "TMDB",
    }),
    findTrailer: async () => ({
      url: "https://www.youtube.com/watch?v=abc123",
      provider: "youtube",
      video_id: "abc123",
    }),
  });
  assert.equal(result.identity_unchanged, true);
  assert.equal(result.identity_after.title, "Keep Title");
  assert.equal(result.identity_after.year, 2011);
  assert.equal(result.title, undefined);
  assert.equal(result.year, undefined);
});

test("4-6. Media patch never writes films / publish / full enrich", () => {
  const patch = buildMediaCandidatePatch({
    poster_url: "https://image.tmdb.org/t/p/w500/a.jpg",
    trailer_url: "https://www.youtube.com/watch?v=x",
    trailer_provider: "youtube",
    trailer_video_id: "x",
    trailer_source: "auto",
    media_status: DISCOVERY_MEDIA_STATUS.complete,
  });
  assert.equal(patch.writes_to_films_table, false);
  assert.equal(patch.publish, false);
  assert.equal(patch.enrich_full, false);
  assert.equal(patch.review_status_unchanged, true);
});

test("7. Official trailer preferred over fan upload", async () => {
  const result = await runMediaCuratorForCandidate(makeCandidate(), {
    eligibilityResult: "PASS",
    findPoster: async () => ({ poster_url: "https://image.tmdb.org/t/p/w500/a.jpg" }),
    findTrailer: async () => ({
      url: "https://www.youtube.com/watch?v=official",
      provider: "youtube",
      video_id: "official",
      accepted_official: true,
      is_fan_upload: false,
      source_label: "TMDB Trailer (official)",
    }),
  });
  assert.equal(result.trailer_url, "https://www.youtube.com/watch?v=official");
});

test("8-9. Wrong-film media is rejected / needs review", async () => {
  const result = await runMediaCuratorForCandidate(makeCandidate(), {
    eligibilityResult: "PASS",
    findPoster: async () => ({
      poster_url: "https://image.tmdb.org/t/p/w500/wrong.jpg",
      wrong_film: true,
      note: "Poster for different year remake",
    }),
    findTrailer: async () => ({
      url: "https://www.youtube.com/watch?v=wrong",
      wrong_film: true,
      note: "Trailer for TV series",
    }),
  });
  assert.equal(result.poster_url, null);
  assert.equal(result.trailer_url, null);
  assert.equal(result.media_status, DISCOVERY_MEDIA_STATUS.needsReview);
});

test("10. Horizontal backdrop is not accepted as poster", () => {
  const poster = buildPosterFromTmdbMovie({
    poster_path: null,
    backdrop_path: "/wide.jpg",
  });
  assert.equal(poster, null);
  const vertical = buildPosterFromTmdbMovie({ poster_path: "/poster.jpg" });
  assert.equal(
    vertical.poster_url,
    "https://image.tmdb.org/t/p/w500/poster.jpg"
  );
  assert.equal(vertical.uses_backdrop, false);
});

test("11-13. media_complete / partial / failed", () => {
  assert.equal(
    resolveMediaStatus({ hasPoster: true, hasTrailer: true }),
    DISCOVERY_MEDIA_STATUS.complete
  );
  assert.equal(
    resolveMediaStatus({ hasPoster: true, hasTrailer: false }),
    DISCOVERY_MEDIA_STATUS.partial
  );
  assert.equal(
    resolveMediaStatus({ hasPoster: false, hasTrailer: false }),
    DISCOVERY_MEDIA_STATUS.failed
  );
});

test("16. approve independence — media failure still allows pending review row", async () => {
  const report = await runWeeklyFilmDiscovery({
    catalogFilms: [],
    existingCandidates: [],
    dryRun: true,
    skipEmail: true,
    targetCount: 1,
    maxRounds: 1,
    researcherFn: async () => ({ candidates: [makeCandidate({ title: "X", year: 2001 })] }),
    mediaCuratorFn: async () => ({
      media_status: DISCOVERY_MEDIA_STATUS.failed,
      poster_url: null,
      trailer_url: null,
      media_notes: "none found",
    }),
  });
  assert.equal(report.passed.length, 1);
  assert.equal(report.passed[0].review_status, "pending_review");
  assert.equal(report.passed[0].media_status, DISCOVERY_MEDIA_STATUS.failed);
});

test("17-19. media-only batch dry-run and skip complete without force", async () => {
  let updates = 0;
  const report = await runDiscoveryMediaBatch(
    [
      {
        id: "1",
        title: "A",
        year: 2020,
        directors: ["D"],
        countries: ["F"],
        media_status: DISCOVERY_MEDIA_STATUS.pending,
        eligibility_result: "PASS",
      },
      {
        id: "2",
        title: "B",
        year: 2021,
        directors: ["D"],
        countries: ["F"],
        media_status: DISCOVERY_MEDIA_STATUS.complete,
        eligibility_result: "PASS",
      },
    ],
    {
      dryRun: true,
      curateFn: async (candidate) =>
        buildMediaCandidatePatch({
          poster_url: "https://image.tmdb.org/t/p/w500/a.jpg",
          trailer_url: "https://www.youtube.com/watch?v=z",
          trailer_provider: "youtube",
          trailer_video_id: "z",
          trailer_source: "auto",
          media_status: DISCOVERY_MEDIA_STATUS.complete,
        }),
      updateFn: async () => {
        updates += 1;
      },
    }
  );
  assert.equal(report.dryRun, true);
  assert.equal(report.databaseMutated, false);
  assert.equal(updates, 0);
  assert.equal(report.tallies.skipped_complete, 1);
  assert.equal(report.tallies.would_update, 1);
  assert.equal(shouldAttemptMediaLookup({ media_status: "media_complete" }), false);
  assert.equal(
    isMediaResumeEligible({ media_status: "media_complete" }, { force: false }),
    false
  );
  assert.equal(
    isMediaResumeEligible({ media_status: "media_complete" }, { force: true }),
    true
  );
});

test("20. email contains poster/trailer links and media status", () => {
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
        original_title: "Sample",
        year: 2020,
        directors: ["D"],
        countries: ["F"],
        runtime_minutes: 90,
        manager_why: "m",
        researcher_why: "r",
        eligibility_result: "PASS",
        media_status: "media_complete",
        poster_url: "https://image.tmdb.org/t/p/w500/p.jpg",
        trailer_url: "https://www.youtube.com/watch?v=abc",
        source_urls: ["https://example.com"],
      },
    ],
    failed: [],
  });
  assert.match(email.text, /media_complete/);
  assert.match(email.text, /image\.tmdb\.org/);
  assert.match(email.text, /youtube\.com\/watch/);
  assert.match(email.text, /\/admin\/film-discovery/);
});

test("21. media URLs stay on staging rows — not public catalog fields", () => {
  const patch = buildMediaCandidatePatch({
    poster_url: "https://image.tmdb.org/t/p/w500/p.jpg",
    trailer_url: "https://www.youtube.com/watch?v=abc",
    media_status: DISCOVERY_MEDIA_STATUS.complete,
  });
  assert.equal(patch.writes_to_films_table, false);
  assert.equal(patch.publish, false);
});

test("workflow does not call media curator for FAIL", async () => {
  let mediaCalls = 0;
  await runWeeklyFilmDiscovery({
    catalogFilms: [],
    existingCandidates: [],
    dryRun: true,
    skipEmail: true,
    targetCount: 1,
    maxRounds: 1,
    researcherFn: async () => ({
      candidates: [makeCandidate({ title: "No Sources", year: 2002, source_urls: [] })],
    }),
    mediaCuratorFn: async () => {
      mediaCalls += 1;
      return { media_status: DISCOVERY_MEDIA_STATUS.complete };
    },
  });
  assert.equal(mediaCalls, 0);
});

test("TMDB Trailer is preferred over Teaser; Featurette ignored", async () => {
  const { selectDiscoveryTrailer } = await import("./film-discovery-media.mjs");
  const selected = await selectDiscoveryTrailer({
    videos: {
      results: [
        {
          key: "feat",
          site: "YouTube",
          type: "Featurette",
          official: true,
          name: "Making Of",
        },
        {
          key: "teaser",
          site: "YouTube",
          type: "Teaser",
          official: true,
          name: "Official Teaser",
        },
        {
          key: "trailer",
          site: "YouTube",
          type: "Trailer",
          official: false,
          name: "Trailer",
        },
      ],
    },
  });
  assert.equal(selected.video.key, "trailer");
  assert.equal(selected.kind, "Trailer");
});

test("YouTube Search is not called when TMDB Trailer exists", async () => {
  let youtubeCalls = 0;
  const report = await runDiscoveryMediaBatch(
    [
      {
        id: "tmdb-hit",
        title: "Has Tmdb Trailer",
        year: 2020,
        directors: ["D"],
        countries: ["F"],
        media_status: DISCOVERY_MEDIA_STATUS.pending,
        eligibility_result: "PASS",
      },
    ],
    {
      dryRun: true,
      delayMs: 0,
      curateFn: async (candidate, options) => {
        // Simulate TMDB hit — must not touch YouTube gate attempts
        assert.equal(options.youtubeSearchGate?.skip, false);
        return {
          ...buildMediaCandidatePatch({
            poster_url: "https://image.tmdb.org/t/p/w500/a.jpg",
            trailer_url: "https://www.youtube.com/watch?v=tmdb1",
            trailer_provider: "youtube",
            trailer_video_id: "tmdb1",
            trailer_source: "auto",
            trailer_source_label: "TMDB Trailer (TMDB marks video as official)",
            media_status: DISCOVERY_MEDIA_STATUS.complete,
          }),
          trailer_origin: "tmdb",
          youtube_search_attempted: false,
          youtube_quota_hit: false,
        };
      },
    }
  );
  assert.equal(report.tallies.trailers_from_tmdb, 1);
  assert.equal(report.tallies.youtube_search_attempts, 0);
  assert.equal(youtubeCalls, 0);
});

test("YouTube 429 keeps poster as media_partial and stops further Search calls", async () => {
  let searchAttempts = 0;
  const gate = { skip: false, reason: null, attempts: 0, quotaErrors: 0 };
  const report = await runDiscoveryMediaBatch(
    [
      {
        id: "a",
        title: "First",
        year: 2020,
        directors: ["D"],
        countries: ["F"],
        media_status: DISCOVERY_MEDIA_STATUS.pending,
        eligibility_result: "PASS",
      },
      {
        id: "b",
        title: "Second",
        year: 2021,
        directors: ["D"],
        countries: ["F"],
        media_status: DISCOVERY_MEDIA_STATUS.pending,
        eligibility_result: "PASS",
      },
    ],
    {
      dryRun: true,
      delayMs: 0,
      curateFn: async (candidate, options) => {
        const youtubeGate = options.youtubeSearchGate ?? gate;
        if (youtubeGate.skip) {
          return {
            ...buildMediaCandidatePatch({
              poster_url: "https://image.tmdb.org/t/p/w500/b.jpg",
              trailer_url: null,
              media_status: DISCOVERY_MEDIA_STATUS.partial,
              media_notes:
                "Trailer search blocked by quota/rate limit and should be retried later. Poster kept; trailer not proven absent. (prior)",
            }),
            trailer_origin: null,
            youtube_search_attempted: false,
            youtube_quota_hit: false,
          };
        }
        searchAttempts += 1;
        youtubeGate.attempts = (youtubeGate.attempts ?? 0) + 1;
        youtubeGate.skip = true;
        youtubeGate.reason = 'YouTube search failed (429) for "First"';
        youtubeGate.quotaErrors = (youtubeGate.quotaErrors ?? 0) + 1;
        return {
          ...buildMediaCandidatePatch({
            poster_url: "https://image.tmdb.org/t/p/w500/a.jpg",
            trailer_url: null,
            media_status: DISCOVERY_MEDIA_STATUS.partial,
            media_notes:
              "Trailer search blocked by quota/rate limit and should be retried later. Poster kept; trailer not proven absent. (429)",
          }),
          trailer_origin: null,
          youtube_search_attempted: true,
          youtube_quota_hit: true,
        };
      },
    }
  );

  assert.equal(searchAttempts, 1);
  assert.equal(report.tallies.media_partial, 2);
  assert.equal(report.tallies.youtube_search_attempts, 1);
  assert.equal(report.tallies.youtube_quota_errors, 1);
  assert.equal(report.results[0].media_status, DISCOVERY_MEDIA_STATUS.partial);
  assert.match(report.results[0].media_notes, /not proven absent/);
  assert.equal(report.results[1].youtube_search_attempted, false);
});

test("media_complete is not reprocessed without force", () => {
  assert.equal(
    isMediaResumeEligible(
      { media_status: DISCOVERY_MEDIA_STATUS.complete },
      { force: false }
    ),
    false
  );
});
