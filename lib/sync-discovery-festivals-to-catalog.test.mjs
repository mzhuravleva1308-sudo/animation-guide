import assert from "node:assert/strict";
import test from "node:test";
import {
  DISCOVERY_RELEASE_FESTIVAL_SOURCE,
  discoveryClaimsToCatalogRows,
  discoveryRecognitionsToCatalogInputs,
} from "./sync-discovery-festivals-to-catalog.mjs";
import { RECOGNITION_TYPE_POSSIBLE } from "./film-festival-claim.mjs";

test("discoveryClaimsToCatalogRows keeps Resonale majors only", () => {
  const rows = discoveryClaimsToCatalogRows(
    [
      {
        festival_name: "Annecy International Animation Film Festival",
        festival_year: 2020,
        recognition_type: RECOGNITION_TYPE_POSSIBLE,
        canonical_festival_id: "annecy",
      },
      {
        festival_name: "Sarasota Film Festival",
        festival_year: 2020,
        recognition_type: RECOGNITION_TYPE_POSSIBLE,
      },
    ],
    "film-1"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].canonical_festival_id, "annecy");
  assert.equal(rows[0].film_id, "film-1");
});

test("discoveryRecognitionsToCatalogInputs keeps awards without source_url", () => {
  const rows = discoveryRecognitionsToCatalogInputs([
    {
      festival_name: "César Awards",
      festival_year: 2023,
      recognition_type: "award",
      award_name: "Best Animated Film",
      award_result: "winner",
      source_url: null,
      import_source: "manual_curator_awards_v1",
      import_key: "curator-cesar-2023",
    },
    {
      festival_name: "",
      festival_year: 2020,
      recognition_type: "award",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].festival_name, "César Awards");
  assert.equal(rows[0].source_url, null);
  assert.equal(rows[0].import_source, "manual_curator_awards_v1");
  assert.equal(
    discoveryRecognitionsToCatalogInputs(null).length,
    0
  );
  assert.equal(
    DISCOVERY_RELEASE_FESTIVAL_SOURCE,
    "discovery_release_v1"
  );
});
