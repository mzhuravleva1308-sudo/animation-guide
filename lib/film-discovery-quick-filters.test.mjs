import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDiscoveryCatalogFilterPills,
  isRecentFilmYear,
  isStopMotionTechnique,
  normalizeDiscoveryQuickFilters,
} from "./film-discovery-quick-filters.mjs";

test("normalizeDiscoveryQuickFilters keeps closed vocabulary", () => {
  assert.deepEqual(
    normalizeDiscoveryQuickFilters(["Sci-Fi", "connection", "bogus"]),
    ["sci-fi", "connection"]
  );
});

test("normalizeDiscoveryQuickFilters drops mutually exclusive tones", () => {
  assert.deepEqual(
    normalizeDiscoveryQuickFilters(["sci-fi", "connection", "distance"]),
    ["sci-fi"]
  );
});

test("isStopMotionTechnique matches public filter terms", () => {
  assert.equal(isStopMotionTechnique("stop-motion animation, puppet animation"), true);
  assert.equal(isStopMotionTechnique("2D animation"), false);
});

test("isRecentFilmYear uses last three calendar years", () => {
  assert.equal(isRecentFilmYear(2024, 2026), true);
  assert.equal(isRecentFilmYear(2023, 2026), false);
});

test("buildDiscoveryCatalogFilterPills mixes derived and proposed", () => {
  const pills = buildDiscoveryCatalogFilterPills({
    year: 2025,
    technique: "claymation",
    quick_filters: ["sci-fi", "distance"],
  });
  assert.deepEqual(
    pills.map((p) => `${p.source}:${p.id}`),
    ["derived:recent", "derived:stop-motion", "proposed:sci-fi", "proposed:distance"]
  );
});
