import test from "node:test";
import assert from "node:assert/strict";
import {
  isAppleWatchProvider,
  pickBestAppleResult,
  prioritizeAppleLinkRegions,
} from "./apple-movie-links.mjs";

test("isAppleWatchProvider", () => {
  assert.equal(isAppleWatchProvider("Apple TV"), true);
  assert.equal(isAppleWatchProvider("Apple TV+"), true);
  assert.equal(isAppleWatchProvider("Netflix"), false);
});

test("prioritizeAppleLinkRegions puts US/GB first and caps", () => {
  assert.deepEqual(prioritizeAppleLinkRegions(["PL", "US", "ZZ", "GB"], 3), [
    "US",
    "GB",
    "PL",
  ]);
});

test("pickBestAppleResult matches title and year", () => {
  const best = pickBestAppleResult(
    [
      {
        trackId: 1,
        trackName: "Flow",
        releaseDate: "2024-08-22T07:00:00Z",
        trackViewUrl: "https://itunes.apple.com/us/movie/flow/id1",
      },
      {
        trackId: 2,
        trackName: "Flower",
        releaseDate: "2014-01-01T07:00:00Z",
        trackViewUrl: "https://itunes.apple.com/us/movie/flower/id2",
      },
    ],
    "Flow",
    null,
    2024
  );
  assert.equal(best?.trackId, 1);
});

test("pickBestAppleResult rejects weak title matches", () => {
  const best = pickBestAppleResult(
    [
      {
        trackId: 3,
        trackName: "Completely Different",
        releaseDate: "2024-01-01T07:00:00Z",
        trackViewUrl: "https://itunes.apple.com/us/movie/x/id3",
      },
    ],
    "Flow",
    null,
    2024
  );
  assert.equal(best, null);
});

test("pickBestAppleResult rejects same title with wrong year", () => {
  const best = pickBestAppleResult(
    [
      {
        trackId: 4,
        trackName: "Flow",
        releaseDate: "2022-01-01T07:00:00Z",
        trackViewUrl: "https://itunes.apple.com/us/movie/flow/id4",
      },
    ],
    "Flow",
    null,
    2024
  );
  assert.equal(best, null);
});
