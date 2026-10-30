import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISCOVERY_PENDING_REVIEW_BUCKET,
  annotateDiscoveryCandidatesWithNearDuplicates,
  classifyDiscoveryPendingReview,
  findNearCatalogDuplicates,
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

test("missing trailer goes to missing_trailer bucket", () => {
  const result = classifyDiscoveryPendingReview({
    ...complete,
    poster_url: null,
    trailer_url: null,
    media_status: "media_needs_review",
  });
  assert.equal(result.bucket, DISCOVERY_PENDING_REVIEW_BUCKET.missingTrailer);
  assert.ok(result.reasons.includes("No poster"));
  assert.ok(result.reasons.includes("No trailer"));
  assert.ok(result.reasons.some((r) => r.startsWith("Media:")));
});

test("missing poster with trailer still needs attention", () => {
  const result = classifyDiscoveryPendingReview({
    ...complete,
    poster_url: null,
  });
  assert.equal(result.bucket, DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention);
  assert.ok(result.reasons.includes("No poster"));
});

test("missing plot tags needs attention", () => {
  const result = classifyDiscoveryPendingReview({
    ...complete,
    storytelling_tags: [],
  });
  assert.equal(result.bucket, DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention);
  assert.ok(result.reasons.includes("Missing plot tags"));
});

test("primarily_for_children flag needs attention even when media is complete", () => {
  const result = classifyDiscoveryPendingReview({
    ...complete,
    eligibility_evidence: {
      review_flags: ["primarily_for_children"],
      primarily_for_children: true,
    },
  });
  assert.equal(result.bucket, DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention);
  assert.ok(result.reasons.some((reason) => /kids\s*\/\s*youth/i.test(reason)));
});

test("partition keeps relative order within buckets", () => {
  const { needsAttention, looksGood, missingTrailer } =
    partitionDiscoveryPendingReview([
      { id: "a", ...complete, poster_url: null },
      { id: "b", ...complete },
      { id: "c", ...complete, trailer_url: null },
      { id: "d", ...complete },
    ]);
  assert.deepEqual(
    needsAttention.map((r) => r.id),
    ["a"]
  );
  assert.deepEqual(
    looksGood.map((r) => r.id),
    ["b", "d"]
  );
  assert.deepEqual(
    missingTrailer.map((r) => r.id),
    ["c"]
  );
});

test("near catalog duplicate by original title and year±1 needs attention", () => {
  const matches = findNearCatalogDuplicates(
    {
      title: "The Boy and the World",
      original_title: "O Menino e o Mundo",
      year: 2014,
    },
    [
      {
        id: "cat-1",
        title: "Boy and the World",
        original_title: "O Menino e o Mundo",
        year: 2013,
      },
    ]
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].year_delta, 1);
  // Both titles normalize to the same string ("boy and the world").
  assert.equal(matches[0].match, "title");

  const withOriginal = annotateDiscoveryCandidatesWithNearDuplicates(
    [
      {
        id: "c1",
        ...complete,
        title: "The Boy and the World",
        original_title: "O Menino e o Mundo",
        year: 2014,
      },
    ],
    [
      {
        id: "cat-1",
        title: "Boy and the World",
        original_title: "O Menino e o Mundo",
        year: 2013,
      },
    ]
  );
  const result = classifyDiscoveryPendingReview(withOriginal[0]);
  assert.equal(result.bucket, DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention);
  assert.ok(
    result.reasons.some((reason) => /Possible catalog duplicate/i.test(reason))
  );

  const unrelated = annotateDiscoveryCandidatesWithNearDuplicates(
    [{ id: "c2", ...complete, title: "Unrelated Film", year: 2014 }],
    [
      {
        id: "cat-1",
        title: "Boy and the World",
        original_title: "O Menino e o Mundo",
        year: 2013,
      },
    ]
  );
  assert.equal(unrelated[0].possible_catalog_duplicates.length, 0);
});

test("year delta beyond threshold is ignored", () => {
  const matches = findNearCatalogDuplicates(
    {
      title: "Flow",
      year: 2024,
    },
    [{ title: "Flow", year: 1990 }]
  );
  assert.deepEqual(matches, []);
});

test("candidates already linked via film_id are not near-dupe flagged", () => {
  const matches = findNearCatalogDuplicates(
    {
      title: "The Boy and the World",
      original_title: "O Menino e o Mundo",
      year: 2014,
      film_id: "already-linked",
    },
    [
      {
        id: "cat-1",
        title: "Boy and the World",
        original_title: "O Menino e o Mundo",
        year: 2013,
      },
    ]
  );
  assert.deepEqual(matches, []);
});
