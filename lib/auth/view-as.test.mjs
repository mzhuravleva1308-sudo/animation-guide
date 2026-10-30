import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClearViewAsCookieOptions,
  buildViewAsCookieOptions,
  normalizeViewAsUserId,
} from "./view-as.mjs";

describe("normalizeViewAsUserId", () => {
  it("accepts uuids and lowercases them", () => {
    assert.equal(
      normalizeViewAsUserId("A0E4C5D6-1234-4ABC-8DEF-1234567890AB"),
      "a0e4c5d6-1234-4abc-8def-1234567890ab"
    );
  });

  it("rejects non-uuids", () => {
    assert.equal(normalizeViewAsUserId("not-a-uuid"), null);
    assert.equal(normalizeViewAsUserId(""), null);
    assert.equal(normalizeViewAsUserId(null), null);
  });
});

describe("view-as cookie options", () => {
  it("sets httpOnly lax cookies", () => {
    const options = buildViewAsCookieOptions(true);
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.secure, true);
    assert.ok(options.maxAge > 0);
  });

  it("clear options expire immediately", () => {
    assert.equal(buildClearViewAsCookieOptions(false).maxAge, 0);
  });
});
