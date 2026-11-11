import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGuideDocumentAuthorNode,
  formatGuideEditorialDate,
  GUIDE_DOCUMENT_AUTHOR,
  guideDocumentAuthorId,
} from "./guide-document-attribution.mjs";

describe("guide-document-attribution", () => {
  it("exports the editorial author name", () => {
    assert.equal(GUIDE_DOCUMENT_AUTHOR, "Maria");
  });

  it("builds a stable Person @id from the site origin", () => {
    assert.equal(
      guideDocumentAuthorId("https://resonale.com"),
      "https://resonale.com/#maria"
    );
    assert.equal(
      guideDocumentAuthorId("https://resonale.com/"),
      "https://resonale.com/#maria"
    );
    assert.deepEqual(buildGuideDocumentAuthorNode("https://resonale.com"), {
      "@type": "Person",
      "@id": "https://resonale.com/#maria",
      name: "Maria",
    });
  });

  it("formats YYYY-MM-DD as a UTC calendar date", () => {
    assert.equal(formatGuideEditorialDate("2026-11-05"), "Nov 5, 2026");
    assert.equal(formatGuideEditorialDate("2026-08-17"), "Aug 17, 2026");
  });
});
