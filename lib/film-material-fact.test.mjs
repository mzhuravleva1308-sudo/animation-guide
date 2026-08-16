import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMaterialFact,
  getMaterialFactPills,
  normalizeMaterialFact,
  parseMaterialFactParts,
} from "./film-material-fact.mjs";

describe("material fact", () => {
  it("normalizes Object. Place", () => {
    assert.equal(
      normalizeMaterialFact("  Public toilets.  Tokyo.  "),
      "Public toilets. Tokyo"
    );
  });

  it("rejects non-facts", () => {
    assert.equal(normalizeMaterialFact("live action"), null);
    assert.equal(normalizeMaterialFact("Soft muted"), null);
    assert.equal(normalizeMaterialFact("Object. Place"), null);
    assert.equal(normalizeMaterialFact(""), null);
    assert.equal(normalizeMaterialFact(null), null);
  });

  it("parses pills as object + place", () => {
    assert.deepEqual(getMaterialFactPills("Public toilets. Tokyo"), [
      "Public toilets",
      "Tokyo",
    ]);
  });

  it("formats from parts", () => {
    assert.equal(
      formatMaterialFact("A wooden cross.", "Iceland."),
      "A wooden cross. Iceland"
    );
    assert.deepEqual(parseMaterialFactParts("Oil paint. An island"), {
      object: "Oil paint",
      place: "An island",
    });
  });
});
