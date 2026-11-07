import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatGuideUpdatedLabel } from "./guide-dates.mjs";

describe("formatGuideUpdatedLabel", () => {
  it("formats YYYY-MM-DD as Updated Month D, YYYY", () => {
    assert.equal(
      formatGuideUpdatedLabel("2026-11-07"),
      "Updated November 7, 2026"
    );
  });

  it("returns null for invalid values", () => {
    assert.equal(formatGuideUpdatedLabel(""), null);
    assert.equal(formatGuideUpdatedLabel("2026-13-01"), null);
    assert.equal(formatGuideUpdatedLabel(null), null);
  });
});
