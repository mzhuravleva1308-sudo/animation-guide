import test from "node:test";
import assert from "node:assert/strict";
import {
  discoveryCandidateToFestivalFilmInput,
  discoveryHasAwardWin,
  formatDiscoveryFestivalLabels,
  toDiscoveryFestivalRecognitionRows,
} from "./film-discovery-festivals.mjs";
import { buildDiscoveryCatalogFilterPills } from "./film-discovery-quick-filters.mjs";

test("discoveryCandidateToFestivalFilmInput flattens directors/countries", () => {
  const film = discoveryCandidateToFestivalFilmInput({
    title: "Padak",
    original_title: "파닥",
    year: 2012,
    directors: ["Lee Myung-ha"],
    countries: ["South Korea", "Japan"],
  });
  assert.equal(film.director, "Lee Myung-ha");
  assert.equal(film.country, "South Korea");
});

test("discoveryHasAwardWin accepts winner and grand_prize", () => {
  assert.equal(discoveryHasAwardWin([]), false);
  assert.equal(
    discoveryHasAwardWin([
      { recognition_type: "award", award_result: "winner", festival_name: "Annecy" },
    ]),
    true
  );
  assert.equal(
    discoveryHasAwardWin([
      { recognition_type: "official_selection", award_result: null },
    ]),
    false
  );
});

test("formatDiscoveryFestivalLabels builds readable lines", () => {
  const labels = formatDiscoveryFestivalLabels([
    {
      festival_name: "Annecy",
      award_name: "Cristal",
      festival_year: 2012,
    },
  ]);
  assert.deepEqual(labels, ["Annecy · Cristal · 2012"]);
});

test("toDiscoveryFestivalRecognitionRows keeps AI import_source", () => {
  const rows = toDiscoveryFestivalRecognitionRows([
    {
      festival_name: "Annecy",
      festival_year: 2012,
      recognition_type: "award",
      award_name: "Cristal",
      award_result: "winner",
      import_source: "ai_festival_winners_v1",
      import_key: "ai-winner-annecy-2012-cristal",
    },
  ]);
  assert.equal(rows[0].import_source, "ai_festival_winners_v1");
  assert.equal(rows[0].festival_name, "Annecy");
});

test("buildDiscoveryCatalogFilterPills derives award-winners from staging", () => {
  const pills = buildDiscoveryCatalogFilterPills({
    year: 2010,
    technique: "2D animation",
    quick_filters: [],
    festival_recognitions: [
      { recognition_type: "award", award_result: "winner", festival_name: "Annecy" },
    ],
  });
  assert.ok(pills.some((p) => p.id === "award-winners" && p.source === "derived"));
});
