import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeYoutubeLinks,
  normalizeYoutubeWatchUrl,
  offersIncludeYoutube,
  youtubeDurationSeconds,
} from "./youtube-watch-links.mjs";

test("normalizeYoutubeWatchUrl accepts watch and youtu.be", () => {
  assert.deepEqual(
    normalizeYoutubeWatchUrl("https://www.youtube.com/watch?v=4p2JVaf8bw8&t=10"),
    {
      videoId: "4p2JVaf8bw8",
      url: "https://www.youtube.com/watch?v=4p2JVaf8bw8",
    }
  );
  assert.deepEqual(normalizeYoutubeWatchUrl("https://youtu.be/4p2JVaf8bw8"), {
    videoId: "4p2JVaf8bw8",
    url: "https://www.youtube.com/watch?v=4p2JVaf8bw8",
  });
  assert.equal(normalizeYoutubeWatchUrl("https://www.youtube.com/results?search_query=x"), null);
});

test("normalizeYoutubeLinks keeps checked misses", () => {
  assert.deepEqual(
    normalizeYoutubeLinks({
      checked_at: "2026-11-02T00:00:00.000Z",
      url: null,
    }),
    {
      checked_at: "2026-11-02T00:00:00.000Z",
      url: null,
      videoId: null,
    }
  );
  assert.equal(offersIncludeYoutube([{ provider: "YouTube" }]), true);
  assert.equal(youtubeDurationSeconds("PT1H17M"), 4620);
});
