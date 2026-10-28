import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN,
  assessDiscoveryChildrenAudience,
  discoveryHasPrimarilyForChildrenFlag,
  withDiscoveryReviewFlag,
} from "./film-discovery-children-audience.mjs";

test("Animafest family program is high-confidence kids", () => {
  const result = assessDiscoveryChildrenAudience({
    title: "Gordon and Paddy",
    year: 2017,
    section: "Family Program - Gordon & Paddy (age 4+)",
    synopsis: "A forest detective and his assistant mouse investigate a crime.",
  });
  assert.equal(result.primarily_for_children, true);
  assert.equal(result.confidence, "high");
});

test("age 14+ alone is not children", () => {
  const result = assessDiscoveryChildrenAudience({
    title: "Extraordinary Tales (Age: 14+)",
    year: 2015,
    section: "GRAND COMPETITION FEATURE FILM",
    synopsis: "Five tales by Edgar Allan Poe.",
  });
  assert.equal(result.primarily_for_children, false);
});

test("TMDB Family alone is medium kids flag", () => {
  const result = assessDiscoveryChildrenAudience({
    title: "Cricket & Antoinette",
    year: 2023,
    synopsis: "A cricket and an ant fall in love.",
    tmdb_genres: ["Animation", "Family", "Comedy"],
  });
  assert.equal(result.primarily_for_children, true);
  assert.equal(result.confidence, "medium");
});

test("explicit children audience copy is high", () => {
  const result = assessDiscoveryChildrenAudience({
    title: "Cricket & Antoinette",
    synopsis: "Target audience: Children 7-11 and family audience.",
  });
  assert.equal(result.primarily_for_children, true);
  assert.equal(result.confidence, "high");
});

test("review flag helpers", () => {
  const flags = withDiscoveryReviewFlag(
    [],
    DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN
  );
  assert.deepEqual(flags, [DISCOVERY_REVIEW_FLAG_PRIMARILY_FOR_CHILDREN]);
  assert.equal(discoveryHasPrimarilyForChildrenFlag(flags), true);
});
