import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDiscoveryImportReviewSignals,
  enrichDiscoveryImportRowsWithReviewSignals,
} from "./film-discovery-import-review-signals.mjs";
import {
  DISCOVERY_REVIEW_FLAG_POSSIBLE_CATALOG_DUPLICATE,
  DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN,
} from "./film-discovery-children-audience.mjs";
import { listDiscoveryPendingReviewAttentionReasons } from "./film-discovery-pending-review.mjs";

test("import signals flag near catalog duplicate year±1", () => {
  const { row, signals } = applyDiscoveryImportReviewSignals(
    {
      title: "Flow",
      original_title: null,
      year: 2025,
      eligibility_evidence: {},
    },
    {
      catalogFilms: [
        {
          id: "abc",
          title: "Flow",
          year: 2024,
          normalized_title: "flow",
        },
      ],
    }
  );

  assert.equal(signals.possible_catalog_duplicate, true);
  assert.equal(signals.primarily_for_children, false);
  assert.ok(
    row.eligibility_evidence.review_flags.includes(
      DISCOVERY_REVIEW_FLAG_POSSIBLE_CATALOG_DUPLICATE
    )
  );
  assert.equal(row.eligibility_evidence.possible_catalog_duplicate, true);
  assert.match(
    row.eligibility_evidence.possible_catalog_duplicate_reason,
    /Possible catalog duplicate/
  );
});

test("import signals flag kids via TMDB Family genre", () => {
  const { row, signals } = applyDiscoveryImportReviewSignals(
    {
      title: "Bigfoot Family",
      year: 2020,
      eligibility_evidence: {},
    },
    { tmdbGenres: ["Animation", "Family", "Adventure"] }
  );

  assert.equal(signals.primarily_for_children, true);
  assert.ok(
    row.eligibility_evidence.review_flags.includes(
      DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN
    )
  );
  assert.equal(row.eligibility_evidence.primarily_for_children, true);
});

test("pending attention reads stored near-dupe flag without live annotation", () => {
  const reasons = listDiscoveryPendingReviewAttentionReasons({
    poster_url: "https://example.com/p.jpg",
    trailer_url: "https://example.com/t",
    media_status: "media_complete",
    content_status: "ready",
    moods: ["warm"],
    aesthetic_tags: ["hand-drawn"],
    storytelling_tags: ["quest"],
    has_festival: true,
    eligibility_evidence: {
      review_flags: [DISCOVERY_REVIEW_FLAG_POSSIBLE_CATALOG_DUPLICATE],
      possible_catalog_duplicate: true,
      possible_catalog_duplicate_reason:
        'Possible catalog duplicate: "Flow" (2024, title, year±1)',
    },
  });
  assert.ok(reasons.some((reason) => /Possible catalog duplicate/i.test(reason)));
});

test("enrich rows uses injectable TMDB genre fetch", async () => {
  const enriched = await enrichDiscoveryImportRowsWithReviewSignals(
    [
      {
        title: "Bigfoot Family",
        year: 2020,
        eligibility_evidence: {},
      },
    ],
    {
      catalogFilms: [],
      tmdbApiKey: "test-key",
      fetchTmdbGenresFn: async () => ["Family", "Animation"],
    }
  );
  assert.equal(enriched.flagged_kids, 1);
  assert.equal(enriched.flagged_near_duplicates, 0);
  assert.equal(
    enriched.rows[0].eligibility_evidence.primarily_for_children,
    true
  );
});
