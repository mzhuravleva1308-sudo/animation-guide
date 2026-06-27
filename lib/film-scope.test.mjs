import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeFilmScope,
  filmScopeArgvTokens,
  parseFilmScopeArgs,
} from "../scripts/film-scope.mjs";

describe("parseFilmScopeArgs", () => {
  it("defaults to full catalog mode", () => {
    const scope = parseFilmScopeArgs([]);

    assert.equal(scope.scoped, false);
    assert.equal(describeFilmScope(scope), "full catalog");
  });

  it("parses single film id scope", () => {
    const scope = parseFilmScopeArgs([
      "--film-id",
      "149c6731-8e23-4b7d-b7ef-79e27a547b61",
    ]);

    assert.equal(scope.scoped, true);
    assert.deepEqual(scope.filmIds, ["149c6731-8e23-4b7d-b7ef-79e27a547b61"]);
    assert.deepEqual(filmScopeArgvTokens(scope), [
      "--film-id",
      "149c6731-8e23-4b7d-b7ef-79e27a547b61",
    ]);
  });

  it("parses title scope and passes through script flags", () => {
    const scope = parseFilmScopeArgs([
      "--title",
      "The Painting",
      "--force",
    ]);

    assert.equal(scope.scoped, true);
    assert.deepEqual(scope.titles, ["The Painting"]);
    assert.deepEqual(scope.passthrough, ["--force"]);
  });

  it("parses comma-separated film ids", () => {
    const scope = parseFilmScopeArgs([
      "--film-ids=a,b",
    ]);

    assert.deepEqual(scope.filmIds, ["a", "b"]);
  });
});
