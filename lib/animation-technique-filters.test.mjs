import assert from "node:assert/strict";
import test from "node:test";
import {
  ANIMATION_TECHNIQUE_FILTERS,
  filmMatchesTechniqueFilter,
  isAnimationTechniqueFilter,
  isStopMotionTechnique,
  techniqueMatchesFilter,
} from "./animation-technique-filters.mjs";

test("technique picker keeps the animation-styles order", () => {
  assert.deepEqual(
    ANIMATION_TECHNIQUE_FILTERS.map((row) => row.id),
    [
      "hand-drawn",
      "digital-2d",
      "3d",
      "stop-motion",
      "rotoscope",
      "cut-out",
      "mixed-media",
      "experimental",
      "painterly",
      "watercolor",
    ]
  );
});

test("isStopMotionTechnique still matches public filter terms", () => {
  assert.equal(
    isStopMotionTechnique("stop-motion animation, puppet animation"),
    true
  );
  assert.equal(isStopMotionTechnique("claymation"), true);
  assert.equal(isStopMotionTechnique("2D animation"), false);
});

test("hand-drawn and digital 2D partition common catalog labels", () => {
  assert.equal(
    techniqueMatchesFilter("hand-drawn animation", "hand-drawn"),
    true
  );
  assert.equal(
    techniqueMatchesFilter("hand-drawn animation", "digital-2d"),
    false
  );
  assert.equal(
    techniqueMatchesFilter("2D animation", "digital-2d"),
    true
  );
  assert.equal(techniqueMatchesFilter("2D animation", "hand-drawn"), false);
  assert.equal(techniqueMatchesFilter("2d", "digital-2d"), true);
  assert.equal(
    techniqueMatchesFilter("2D computer animation", "digital-2d"),
    true
  );
});

test("distinctive methods match catalog phrasing", () => {
  assert.equal(
    techniqueMatchesFilter("rotoscoped animation", "rotoscope"),
    true
  );
  assert.equal(
    techniqueMatchesFilter("silhouette animation", "cut-out"),
    true
  );
  assert.equal(
    techniqueMatchesFilter("3D computer animation", "3d"),
    true
  );
  assert.equal(
    techniqueMatchesFilter("paint-on-glass animation", "painterly"),
    true
  );
  assert.equal(
    techniqueMatchesFilter("watercolor-style anime", "watercolor"),
    true
  );
  assert.equal(
    filmMatchesTechniqueFilter(
      { technique: "mixed techniques, collage" },
      "mixed-media"
    ),
    true
  );
  assert.equal(
    techniqueMatchesFilter("3D animation / experimental animation", "experimental"),
    true
  );
});

test("unknown ids are not technique filters", () => {
  assert.equal(isAnimationTechniqueFilter("stop-motion"), true);
  assert.equal(isAnimationTechniqueFilter("sci-fi"), false);
  assert.equal(isAnimationTechniqueFilter(null), false);
});
