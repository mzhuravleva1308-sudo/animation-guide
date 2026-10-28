import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISCOVERY_PENDING_REVIEW_BUCKET,
  classifyDiscoveryPendingReview,
  partitionDiscoveryPendingReview,
} from "./film-discovery-pending-review.mjs";

const complete = {
  poster_url: "https://example.com/p.jpg",
  trailer_url: "https://youtube.com/watch?v=abcdefghijk",
  media_status: "media_complete",
  content_status: "ready_with_note",
  moods: ["tender"],
  aesthetic_tags: ["hand-drawn"],
  storytelling_tags: ["survival"],
  has_festival: true,
};

test("complete card looks good", () => {
  const result = classifyDiscoveryPendingReview(complete);
  assert.equal(result.bucket, DISCOVERY_PENDING_REVIEW_BUCKET.looksGood);
  assert.deepEqual(result.reasons, []);
});

test("missing poster/trailer needs attention", () => {
  const result = classifyDiscoveryPendingReview({
    ...complete,
    poster_url: null,
    trailer_url: null,
    media_status: "media_needs_review",
  });
  assert.equal(result.bucket, DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention);
  assert.ok(result.reasons.includes("No poster"));
  assert.ok(result.reasons.includes("No trailer"));
  assert.ok(result.reasons.some((r) => r.startsWith("Media:")));
});

test("missing plot tags needs attention", () => {
  const result = classifyDiscoveryPendingReview({
    ...complete,
    storytelling_tags: [],
  });
  assert.equal(result.bucket, DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention);
  assert.ok(result.reasons.includes("Missing plot tags"));
});

test("partition keeps relative order within buckets", () => {
  const { needsAttention, looksGood } = partitionDiscoveryPendingReview([
    { id: "a", ...complete, poster_url: null },
    { id: "b", ...complete },
    { id: "c", ...complete, trailer_url: null },
    { id: "d", ...complete },
  ]);
  assert.deepEqual(
    needsAttention.map((r) => r.id),
    ["a", "c"]
  );
  assert.deepEqual(
    looksGood.map((r) => r.id),
    ["b", "d"]
  );
});
