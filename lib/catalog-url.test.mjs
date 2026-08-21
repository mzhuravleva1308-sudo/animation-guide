import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEDIA_TYPE } from "./media-type.mjs";
import {
  CATALOG_FILTER_QUERY_PARAM,
  buildCatalogPath,
  parseCatalogQuickFilter,
} from "./catalog-url.mjs";

describe("parseCatalogQuickFilter", () => {
  it("accepts public animation chips and techniques", () => {
    assert.equal(parseCatalogQuickFilter("sci-fi"), "sci-fi");
    assert.equal(parseCatalogQuickFilter("rotoscope"), "rotoscope");
    assert.equal(parseCatalogQuickFilter("recent"), "recent");
  });

  it("ignores unknown values and blanks", () => {
    assert.equal(parseCatalogQuickFilter("bogus"), null);
    assert.equal(parseCatalogQuickFilter(""), null);
    assert.equal(parseCatalogQuickFilter("  "), null);
    assert.equal(parseCatalogQuickFilter(null), null);
  });

  it("drops filters that do not belong on the active media", () => {
    assert.equal(
      parseCatalogQuickFilter("rotoscope", MEDIA_TYPE.liveAction),
      null
    );
    assert.equal(
      parseCatalogQuickFilter("landscapes", MEDIA_TYPE.animation),
      null
    );
    assert.equal(
      parseCatalogQuickFilter("landscapes", MEDIA_TYPE.liveAction),
      "landscapes"
    );
    assert.equal(
      parseCatalogQuickFilter("sci-fi", MEDIA_TYPE.liveAction),
      "sci-fi"
    );
  });
});

describe("buildCatalogPath", () => {
  it("omits default animation media and a cleared filter", () => {
    assert.equal(buildCatalogPath(), "/");
    assert.equal(buildCatalogPath({ media: MEDIA_TYPE.animation }), "/");
    assert.equal(buildCatalogPath({ filter: null }), "/");
  });

  it("writes media then filter, skipping invalid pairs", () => {
    assert.equal(buildCatalogPath({ filter: "sci-fi" }), "/?filter=sci-fi");
    assert.equal(
      buildCatalogPath({
        media: MEDIA_TYPE.liveAction,
        filter: "landscapes",
      }),
      "/?media=live_action&filter=landscapes"
    );
    assert.equal(
      buildCatalogPath({
        media: MEDIA_TYPE.liveAction,
        filter: "rotoscope",
      }),
      "/?media=live_action"
    );
    assert.equal(CATALOG_FILTER_QUERY_PARAM, "filter");
  });
});
