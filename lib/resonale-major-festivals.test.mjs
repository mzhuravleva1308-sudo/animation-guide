import assert from "node:assert/strict";
import test from "node:test";
import {
  filterClaimsToResonaleMajorFestivals,
  isExcludedCannesMarketContext,
  isResonaleMajorFestival,
  matchResonaleMajorFestival,
  RESONALE_MAJOR_FESTIVALS,
} from "./resonale-major-festivals.mjs";

test("canon has 35 major festivals", () => {
  assert.equal(RESONALE_MAJOR_FESTIVALS.length, 35);
});

test("matches Annecy, Berlinale, Hiroshima legacy name", () => {
  assert.equal(matchResonaleMajorFestival("Annecy 2021")?.id, "annecy");
  assert.equal(
    matchResonaleMajorFestival("Berlin International Film Festival (Berlinale)")
      ?.id,
    "berlinale"
  );
  assert.equal(
    matchResonaleMajorFestival("Hiroshima International Animation Festival")
      ?.id,
    "hiroshima"
  );
});

test("rejects non-major festivals", () => {
  assert.equal(isResonaleMajorFestival("Sarasota Film Festival"), false);
  assert.equal(isResonaleMajorFestival("César Awards"), false);
  assert.equal(isResonaleMajorFestival("Golden Horse Awards"), false);
  assert.equal(isResonaleMajorFestival("Tokyo Anime Award Festival"), false);
});

test("rejects Cannes market context", () => {
  assert.equal(
    isExcludedCannesMarketContext({
      original_text: "Shown at Marché du Film",
    }),
    true
  );
  assert.equal(
    matchResonaleMajorFestival("Cannes Film Festival", {
      original_text: "Market screening only",
    }),
    null
  );
  assert.equal(
    matchResonaleMajorFestival("Cannes Film Festival", {
      original_text: "Un Certain Regard",
    })?.id,
    "cannes"
  );
});

test("filterClaimsToResonaleMajorFestivals drops non-major", () => {
  const filtered = filterClaimsToResonaleMajorFestivals([
    { festival_name: "Annecy International Animation Film Festival", festival_year: 2018 },
    { festival_name: "Some Local Fest", festival_year: 2018 },
    { festival_name: "Venice Film Festival", festival_year: 2017 },
  ]);
  assert.deepEqual(
    filtered.map((r) => r.canonical_festival_id),
    ["annecy", "venice"]
  );
});
