import test from "node:test";
import assert from "node:assert/strict";
import {
  amazonUrlForRegion,
  normalizeAmazonLinks,
  normalizeAmazonVideoUrl,
  offersIncludeAmazonVideo,
} from "./amazon-watch-links.mjs";

test("normalizeAmazonVideoUrl accepts amazon and primevideo detail pages", () => {
  assert.deepEqual(
    normalizeAmazonVideoUrl(
      "https://www.amazon.com/gp/video/detail/B0D1234567/ref=foo"
    ),
    {
      kind: "amazon",
      asin: "B0D1234567",
      url: "https://www.amazon.com/gp/video/detail/B0D1234567",
    }
  );
  assert.deepEqual(
    normalizeAmazonVideoUrl("https://www.primevideo.com/detail/0KABCDEFGH"),
    {
      kind: "primevideo",
      asin: null,
      url: "https://www.primevideo.com/detail/0KABCDEFGH",
    }
  );
  assert.equal(
    normalizeAmazonVideoUrl("https://www.amazon.com/s?k=flow"),
    null
  );
});

test("amazonUrlForRegion remaps ASIN to local storefront", () => {
  assert.equal(
    amazonUrlForRegion(
      "https://www.amazon.com/gp/video/detail/B0D1234567",
      "DE"
    ),
    "https://www.amazon.de/gp/video/detail/B0D1234567"
  );
});

test("normalizeAmazonLinks and offersIncludeAmazonVideo", () => {
  assert.equal(
    normalizeAmazonLinks({
      url: "https://www.amazon.fr/dp/B0D1234567",
      checked_at: "2026-11-02T00:00:00.000Z",
    })?.asin,
    "B0D1234567"
  );
  assert.equal(offersIncludeAmazonVideo([{ provider: "Amazon Video" }]), true);
  assert.equal(offersIncludeAmazonVideo([{ provider: "Prime Video" }]), false);
});
