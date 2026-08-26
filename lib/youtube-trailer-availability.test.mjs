import test from "node:test";
import assert from "node:assert/strict";
import {
  checkYoutubeVideoAvailability,
  checkYoutubeVideosAvailability,
  createYoutubeAvailabilityChecker,
  evaluateYoutubeRegionRestriction,
  parseVimeoVideoId,
  parseYoutubeVideoId,
} from "./youtube-trailer-availability.mjs";

test("parses watch, short, embed, and raw YouTube ids", () => {
  assert.equal(
    parseYoutubeVideoId("https://www.youtube.com/watch?v=TS3SrQaRqmg"),
    "TS3SrQaRqmg"
  );
  assert.equal(parseYoutubeVideoId("https://youtu.be/TS3SrQaRqmg"), "TS3SrQaRqmg");
  assert.equal(
    parseYoutubeVideoId("https://www.youtube.com/embed/TS3SrQaRqmg"),
    "TS3SrQaRqmg"
  );
  assert.equal(parseYoutubeVideoId("TS3SrQaRqmg"), "TS3SrQaRqmg");
  assert.equal(parseYoutubeVideoId("https://vimeo.com/123"), null);
});

test("parses Vimeo numeric ids", () => {
  assert.equal(parseVimeoVideoId("https://vimeo.com/123456789"), "123456789");
  assert.equal(
    parseVimeoVideoId("https://player.vimeo.com/video/123456789"),
    "123456789"
  );
});

test("Data API empty items means the video is gone", async () => {
  const result = await checkYoutubeVideoAvailability({
    videoId: "TS3SrQaRqmg",
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [] }),
    }),
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, "youtube_video_not_found");
});

test("oEmbed 404 means the video is gone when Data API is missing", async () => {
  const result = await checkYoutubeVideoAvailability({
    videoId: "deadvideo11",
    fetchImpl: async () => ({
      ok: false,
      status: 404,
    }),
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, "youtube_oembed_not_found");
});

test("oEmbed 401 without Data API does not reject embed-disabled watch links", async () => {
  const result = await checkYoutubeVideoAvailability({
    videoId: "embeddable11",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
    }),
  });
  assert.equal(result.available, true);
  assert.equal(result.reason, "youtube_oembed_restricted_embed");
});

test("batch Data API marks missing ids unavailable", async () => {
  const results = await checkYoutubeVideosAvailability(
    ["liveVideo11", "deadVideo11"],
    {
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "liveVideo11",
              status: { privacyStatus: "public", uploadStatus: "processed" },
              snippet: { title: "Live" },
            },
          ],
        }),
      }),
    }
  );
  assert.equal(results.get("liveVideo11").available, true);
  assert.equal(results.get("deadVideo11").available, false);
  assert.equal(results.get("deadVideo11").reason, "youtube_video_not_found");
});

test("availability checker caches per video id", async () => {
  let calls = 0;
  const isAvailable = createYoutubeAvailabilityChecker({
    apiKey: "test-key",
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    },
  });
  assert.equal(await isAvailable({ key: "deadVideo11" }), false);
  assert.equal(await isAvailable({ key: "deadVideo11" }), false);
  assert.equal(calls, 1);
});

test("US-only allow-list is not catalog-safe; broad allow-list and RU block are", () => {
  assert.equal(
    evaluateYoutubeRegionRestriction({ allowed: ["US"] }).ok,
    false
  );
  assert.equal(
    evaluateYoutubeRegionRestriction({ allowed: ["US"] }).reason,
    "youtube_geo_allowlist"
  );
  assert.equal(
    evaluateYoutubeRegionRestriction({ blocked: ["RU", "BY"] }).ok,
    true
  );
  const worldwide = Array.from({ length: 80 }, (_, i) => `C${i}`);
  assert.equal(
    evaluateYoutubeRegionRestriction({ allowed: worldwide }).ok,
    true
  );
  const blockedEverywhere = Array.from({ length: 40 }, (_, i) => `C${i}`);
  assert.equal(
    evaluateYoutubeRegionRestriction({ blocked: blockedEverywhere }).ok,
    false
  );
});

test("Data API rejects Netflix-style US-only trailers", async () => {
  const result = await checkYoutubeVideoAvailability({
    videoId: "vhcXyK8s-io",
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: "vhcXyK8s-io",
            status: { privacyStatus: "public", uploadStatus: "processed" },
            contentDetails: { regionRestriction: { allowed: ["US"] } },
          },
        ],
      }),
    }),
  });
  assert.equal(result.available, false);
  assert.equal(result.reason, "youtube_geo_allowlist");
});
