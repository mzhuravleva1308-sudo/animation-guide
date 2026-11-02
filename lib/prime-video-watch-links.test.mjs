import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePrimeLinks,
  normalizePrimeVideoUrl,
  offersIncludePrimeVideo,
} from "./prime-video-watch-links.mjs";

test("normalizePrimeVideoUrl accepts detail pages and strips locale prefix", () => {
  assert.deepEqual(
    normalizePrimeVideoUrl(
      "https://www.primevideo.com/-/ro/detail/0SGTMQ5XHD0LZI54RUWCZ8MV1K?ref=foo"
    ),
    {
      id: "0SGTMQ5XHD0LZI54RUWCZ8MV1K",
      url: "https://www.primevideo.com/detail/0SGTMQ5XHD0LZI54RUWCZ8MV1K",
    }
  );
  assert.equal(
    normalizePrimeVideoUrl("https://www.amazon.com/gp/video/detail/B0GWW38F29"),
    null
  );
});

test("normalizePrimeLinks and offersIncludePrimeVideo", () => {
  assert.equal(
    normalizePrimeLinks({
      url: "https://www.primevideo.com/detail/0ABC",
      checked_at: "2026-11-02T00:00:00.000Z",
    })?.id,
    "0ABC"
  );
  assert.deepEqual(
    normalizePrimeLinks({
      url: null,
      id: null,
      checked_at: "2026-11-02T00:00:00.000Z",
    }),
    {
      checked_at: "2026-11-02T00:00:00.000Z",
      url: null,
      id: null,
    }
  );
  assert.equal(normalizePrimeLinks({ url: null }), null);
  assert.equal(offersIncludePrimeVideo([{ provider: "Prime Video" }]), true);
  assert.equal(offersIncludePrimeVideo([{ provider: "Amazon Video" }]), false);
});
