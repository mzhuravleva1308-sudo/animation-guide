import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getFilmTechniquePills } from "./film-technique.mjs";

describe("getFilmTechniquePills", () => {
  it("returns an empty list for missing technique", () => {
    assert.deepEqual(getFilmTechniquePills(null), []);
    assert.deepEqual(getFilmTechniquePills(""), []);
  });

  it("returns one pill for a single technique", () => {
    assert.deepEqual(getFilmTechniquePills("Stop motion"), ["Stop motion"]);
  });

  it("returns up to two pills for comma-separated techniques", () => {
    assert.deepEqual(getFilmTechniquePills("Stop-motion, 2D"), [
      "Stop-motion",
      "2D",
    ]);
  });

  it("deduplicates repeated techniques case-insensitively", () => {
    assert.deepEqual(getFilmTechniquePills("2D, 2d"), ["2D"]);
  });

  it("respects a custom max count", () => {
    assert.deepEqual(
      getFilmTechniquePills("Stop-motion, 2D, mixed media", 1),
      ["Stop-motion"]
    );
  });
});
