import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCatalogUpdatedLabel,
  formatCatalogUpdatedShortLabel,
  maxIsoTimestamps,
} from "./catalog-last-updated.mjs";

describe("maxIsoTimestamps", () => {
  it("returns the newest ISO among valid values", () => {
    assert.equal(
      maxIsoTimestamps(
        "2026-01-15T12:00:00.000Z",
        null,
        "2026-03-01T18:00:00.000Z",
        "2026-02-10T00:00:00.000Z"
      ),
      "2026-03-01T18:00:00.000Z"
    );
  });

  it("returns null when nothing is usable", () => {
    assert.equal(maxIsoTimestamps(null, undefined, "", "not-a-date"), null);
  });
});

describe("formatCatalogUpdatedLabel", () => {
  it("formats a full catalog-updated label in UTC", () => {
    assert.equal(
      formatCatalogUpdatedLabel("2026-03-01T18:00:00.000Z"),
      "Catalog updated March 2026"
    );
  });

  it("keeps late UTC days in the UTC month", () => {
    // 2026-03-01 01:00+02 would still be Feb 28 UTC if we used local TZ wrong;
    // this instant is clearly March UTC.
    assert.equal(
      formatCatalogUpdatedLabel("2026-03-01T00:30:00.000Z"),
      "Catalog updated March 2026"
    );
  });

  it("returns null for bad input", () => {
    assert.equal(formatCatalogUpdatedLabel(null), null);
    assert.equal(formatCatalogUpdatedLabel("nope"), null);
  });
});

describe("formatCatalogUpdatedShortLabel", () => {
  it("formats short month and year in UTC", () => {
    assert.equal(
      formatCatalogUpdatedShortLabel("2026-03-01T18:00:00.000Z"),
      "Updated Mar 2026"
    );
  });

  it("returns null for bad input", () => {
    assert.equal(formatCatalogUpdatedShortLabel(null), null);
  });
});
