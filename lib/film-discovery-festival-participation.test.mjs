import assert from "node:assert/strict";
import test from "node:test";
import {
  discoveryHasFestival,
  formatDiscoveryFestivalClaimLabels,
  toDiscoveryFestivalClaimRows,
} from "./film-discovery-festival-participation.mjs";

test("discoveryHasFestival is true from explicit flag", () => {
  assert.equal(discoveryHasFestival({ has_festival: true }), true);
  assert.equal(discoveryHasFestival({ has_festival: false }), false);
});

test("discoveryHasFestival is true from claims or award wins", () => {
  assert.equal(
    discoveryHasFestival({
      has_festival: false,
      festival_claims: [{ festival_name: "Annecy" }],
    }),
    true
  );
  assert.equal(
    discoveryHasFestival({
      festival_recognitions: [
        { recognition_type: "award", award_result: "winner" },
      ],
    }),
    true
  );
  assert.equal(discoveryHasFestival({ festival_claims: [] }), false);
});

test("toDiscoveryFestivalClaimRows keeps participation shape", () => {
  const rows = toDiscoveryFestivalClaimRows([
    {
      festival_name: "Berlinale",
      festival_year: 2024,
      recognition_type: "possible_participation",
      discovery_source: "ai_discovery_v1",
      original_text: "Premiered in Berlin",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].festival_name, "Berlinale");
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
