import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVideoLanguageList,
  parseArgs,
  readiness,
  validEmbedding,
} from "../scripts/process-film-batch.mjs";

const id = "78a124c0-3523-49e5-8c6f-6b37feacc307";
const baseFilm = {
  title: "Film",
  year: 2026,
  synopsis: "Synopsis",
  the_mood: "Tender",
  technique: "2D",
  moods: ["tender"],
  aesthetic_tags: ["handmade"],
  image_url: "https://image.test/poster.jpg",
  trailer_url: "https://youtube.test/video",
};

test("dry-run mode is explicit", () => {
  assert.equal(parseArgs(["--film-ids", id, "--dry-run"]).dryRun, true);
});

test("execute mode is explicit", () => {
  assert.equal(parseArgs(["--film-ids", id, "--execute"]).execute, true);
});

test("unknown UUID format is rejected", () => {
  assert.throws(
    () => parseArgs(["--film-ids", "not-a-uuid", "--dry-run"]),
    /Invalid film UUID/
  );
});

test("duplicate UUIDs are rejected", () => {
  assert.throws(
    () => parseArgs(["--film-ids", `${id},${id}`, "--dry-run"]),
    /Duplicate/
  );
});

test("dry-run accepts skip-media and rebuild flags", () => {
  const options = parseArgs([
    "--film-ids",
    id,
    "--dry-run",
    "--skip-media",
    "--rebuild-all-profiles",
  ]);
  assert.equal(options.skipMedia, true);
  assert.equal(options.rebuildAllProfiles, true);
});

test("ranking-ready films do not require enrichment", () => {
  const state = readiness(baseFilm, true, true);
  assert.equal(state.rankingReady, true);
});

test("missing trailer does not block ranking readiness", () => {
  const state = readiness({ ...baseFilm, trailer_url: null }, true, true);
  assert.equal(state.rankingReady, true);
  assert.equal(state.video, false);
});

test("missing embedding blocks ranking readiness", () => {
  const state = readiness(baseFilm, false, true);
  assert.equal(state.rankingReady, false);
});

test("missing image blocks catalog readiness only", () => {
  const state = readiness({ ...baseFilm, image_url: null }, true, true);
  assert.equal(state.rankingReady, true);
  assert.equal(state.catalogReady, false);
});

test("missing mandatory metadata blocks catalog readiness", () => {
  const state = readiness({ ...baseFilm, synopsis: null }, true, true);
  assert.equal(state.metadata, false);
  assert.equal(state.catalogReady, false);
});

test("embedding vectors are validated for numeric content", () => {
  assert.equal(validEmbedding([0, 1, 0]), true);
  assert.equal(validEmbedding([0, Number.NaN, 0]), false);
});

test("TMDB video languages include English, original, and null", () => {
  assert.deepEqual(buildVideoLanguageList("fr"), ["en", "fr", "null"]);
});
