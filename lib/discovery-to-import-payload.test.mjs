import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoOverwrite,
  isNonEmptyFilmField,
  mergeFilmFieldsNoOverwrite,
} from "./film-field-merge.mjs";
import {
  buildDiscoveryReleasePayload,
  buildInitialReleaseChecklist,
  DISCOVERY_RELEASE_ORIGIN,
  DISCOVERY_RELEASE_STATUS,
  mapDiscoverySourceUrls,
  mergeReleaseChecklist,
  normalizeTechniqueList,
  shouldDeferProfileEnqueueForFilm,
} from "./discovery-to-import-payload.mjs";
import { buildFilmInsertPayload } from "../scripts/process-film-batch.mjs";

function nerdlandCandidate(overrides = {}) {
  return {
    id: "2829cfb3-063c-4435-9b28-24dbed212231",
    title: "Nerdland",
    original_title: "Nerdland",
    year: 2016,
    directors: ["Chris Prynoski"],
    countries: ["United States"],
    runtime_minutes: 85,
    source_urls: [],
    synopsis:
      "Two struggling actors in Los Angeles try to become famous before their 30th birthdays while caught in a public crime scandal.",
    the_mood:
      "Dark and ironic, with chaotic Los Angeles nightlife and frantic, desperate behavior.",
    technique: "hand-drawn animation",
    moods: ["dark", "ironic", "energetic"],
    aesthetic_tags: ["chaotic urban landscape", "sketch-like"],
    quick_filters: ["distance", "sarcasm"],
    festival_recognitions: [],
    poster_url:
      "https://image.tmdb.org/t/p/w500/lBzgtwaSWHdcuqvXpfkqGPq7uvr.jpg",
    trailer_url: "https://www.youtube.com/watch?v=EK51f2kqWiQ",
    trailer_provider: "youtube",
    trailer_video_id: "EK51f2kqWiQ",
    trailer_source: "auto",
    ...overrides,
  };
}

test("normalizeTechniqueList accepts string or array", () => {
  assert.deepEqual(normalizeTechniqueList("hand-drawn animation"), [
    "hand-drawn animation",
  ]);
  assert.deepEqual(normalizeTechniqueList(["2D", "2D", "CGI"]), ["2D", "CGI"]);
});

test("mapDiscoverySourceUrls classifies hosts", () => {
  const mapped = mapDiscoverySourceUrls([
    "https://www.themoviedb.org/movie/389627-nerdland",
    "https://www.imdb.com/title/tt123/",
    "https://example.com/official",
  ]);
  assert.equal(
    mapped.tmdb,
    "https://www.themoviedb.org/movie/389627-nerdland"
  );
  assert.equal(mapped.imdb, "https://www.imdb.com/title/tt123/");
  assert.equal(mapped.official, "https://example.com/official");
});

test("buildDiscoveryReleasePayload preserves staging fields and hides catalog", () => {
  const result = buildDiscoveryReleasePayload(nerdlandCandidate(), {
    tmdbId: 389627,
  });
  assert.equal(result.ready, true);
  assert.equal(result.payload.catalog_visible, false);
  assert.equal(result.payload.origin, DISCOVERY_RELEASE_ORIGIN);
  assert.equal(result.payload.technique[0], "hand-drawn animation");
  assert.deepEqual(result.payload.moods, ["dark", "ironic", "energetic"]);
  assert.equal(
    result.payload.image_url,
    "https://image.tmdb.org/t/p/w500/lBzgtwaSWHdcuqvXpfkqGPq7uvr.jpg"
  );
  assert.equal(result.payload.poster_url, undefined);
  assert.match(result.payload.source_urls.tmdb, /389627/);
  assert.ok(result.warnings.includes("missing_tmdb_url") === false);
});

test("buildDiscoveryReleasePayload blocks incomplete candidates", () => {
  const result = buildDiscoveryReleasePayload(
    nerdlandCandidate({ synopsis: null, technique: [] })
  );
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("missing_synopsis"));
  assert.ok(result.blockers.includes("missing_technique"));
});

test("shouldDeferProfileEnqueueForFilm for discovery and hidden catalog", () => {
  assert.equal(
    shouldDeferProfileEnqueueForFilm({ origin: DISCOVERY_RELEASE_ORIGIN }),
    true
  );
  assert.equal(shouldDeferProfileEnqueueForFilm({ catalog_visible: false }), true);
  assert.equal(shouldDeferProfileEnqueueForFilm({ catalog_visible: true }), false);
});

test("mergeFilmFieldsNoOverwrite never replaces filled values", () => {
  const patch = mergeFilmFieldsNoOverwrite(
    { synopsis: "Keep me", the_mood: null, moods: ["dark"] },
    {
      synopsis: "Overwrite?",
      the_mood: "New mood",
      moods: ["bright"],
      trailer_url: "https://example.com/t",
    }
  );
  assert.deepEqual(patch, {
    the_mood: "New mood",
    trailer_url: "https://example.com/t",
  });
  assert.equal(isNonEmptyFilmField("x"), true);
  assert.equal(assertNoOverwrite({ synopsis: "A" }, { synopsis: "A" }).ok, true);
  assert.equal(assertNoOverwrite({ synopsis: "A" }, { synopsis: "B" }).ok, false);
});

test("mergeReleaseChecklist does not regress completed flags", () => {
  const merged = mergeReleaseChecklist(
    {
      inserted: true,
      moods: "preserved",
      profile_scores: "enqueued",
      poster_cached_storage: true,
    },
    {
      inserted: false,
      moods: "filled",
      profile_scores: "deferred",
      poster_cached_storage: false,
      trailer: "filled",
    }
  );
  assert.equal(merged.inserted, true);
  assert.equal(merged.moods, "preserved");
  assert.equal(merged.profile_scores, "enqueued");
  assert.equal(merged.poster_cached_storage, true);
  assert.equal(merged.trailer, "filled");
});

test("buildFilmInsertPayload carries preserved tags/media without poster_url", () => {
  const mapped = buildDiscoveryReleasePayload(nerdlandCandidate(), {
    tmdbId: 389627,
  });
  const insert = buildFilmInsertPayload(mapped.payload);
  assert.equal(insert.catalog_visible, false);
  assert.deepEqual(insert.moods, ["dark", "ironic", "energetic"]);
  assert.equal(insert.trailer_url, mapped.payload.trailer_url);
  assert.equal(insert.image_url, mapped.payload.image_url);
  assert.equal(insert.poster_url, undefined);
  assert.equal(insert.technique, "hand-drawn animation");
});

test("buildInitialReleaseChecklist marks preserved fields", () => {
  const checklist = buildInitialReleaseChecklist({
    warnings: ["missing_tmdb_url"],
    preserved: { moods: true, aesthetic_tags: true, image: true, trailer: true },
  });
  assert.equal(checklist.moods, "preserved");
  assert.equal(checklist.profile_scores, "deferred");
  assert.equal(checklist.catalog_visible, false);
  assert.deepEqual(checklist.warnings, ["missing_tmdb_url"]);
  assert.equal(DISCOVERY_RELEASE_STATUS.queued, "queued");
});
