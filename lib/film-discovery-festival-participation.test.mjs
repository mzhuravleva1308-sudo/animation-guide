import assert from "node:assert/strict";
import test from "node:test";
import {
  discoveryHasFestival,
  discoveryHasMajorFestivalAward,
  formatDiscoveryFestivalClaimLabels,
  toDiscoveryFestivalClaimRows,
} from "./film-discovery-festival-participation.mjs";

test("discoveryHasFestival ignores non-major claims and flag alone", () => {
  assert.equal(discoveryHasFestival({ has_festival: true }), false);
  assert.equal(
    discoveryHasFestival({
      festival_claims: [{ festival_name: "Sarasota Film Festival" }],
    }),
    false
  );
  assert.equal(
    discoveryHasFestival({
      festival_claims: [{ festival_name: "Annecy International Animation Film Festival" }],
    }),
    true
  );
});

test("discoveryHasFestival accepts major award wins only", () => {
  assert.equal(
    discoveryHasMajorFestivalAward([
      {
        festival_name: "César Awards",
        recognition_type: "award",
        award_result: "winner",
      },
    ]),
    false
  );
  assert.equal(
    discoveryHasFestival({
      festival_recognitions: [
        {
          festival_name: "Annecy International Animation Film Festival",
          recognition_type: "award",
          award_result: "winner",
        },
      ],
    }),
    true
  );
});

test("toDiscoveryFestivalClaimRows filters to major festivals", () => {
  const rows = toDiscoveryFestivalClaimRows([
    {
      festival_name: "Berlinale",
      festival_year: 2024,
      recognition_type: "possible_participation",
      discovery_source: "ai_discovery_v1",
      original_text: "Premiered in Berlin",
    },
    {
      festival_name: "Local Indie Fest",
      festival_year: 2024,
      discovery_source: "ai_discovery_v1",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].canonical_festival_id, "berlinale");
  assert.equal(rows[0].import_source, "ai_discovery_v1");
});

test("formatDiscoveryFestivalClaimLabels joins name and year", () => {
  assert.deepEqual(
    formatDiscoveryFestivalClaimLabels([
      { festival_name: "TIFF", festival_year: 2023 },
      { festival_name: "  " },
    ]),
    ["TIFF · 2023"]
  );
});
