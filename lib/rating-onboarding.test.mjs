import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getRatingOnboardingHint,
  hasAnyFilmRating,
} from "./rating-onboarding.mjs";

describe("getRatingOnboardingHint", () => {
  it("returns null when the user already has a rating", () => {
    assert.equal(
      getRatingOnboardingHint({
        index: 0,
        hasAnyRating: true,
        ratingHintsDismissed: false,
      }),
      null
    );
  });

  it("returns null when the onboarding series was dismissed", () => {
    assert.equal(
      getRatingOnboardingHint({
        index: 0,
        hasAnyRating: false,
        ratingHintsDismissed: true,
      }),
      null
    );
  });

  it("returns extended, short, then null by visible card index", () => {
    const hints = [0, 1, 2, 3, 4, 5].map((index) =>
      getRatingOnboardingHint({
        index,
        hasAnyRating: false,
        ratingHintsDismissed: false,
      })
    );

    assert.deepEqual(hints, [
      "extended",
      "extended",
      "extended",
      "short",
      "short",
      null,
    ]);
  });
});

describe("hasAnyFilmRating", () => {
  it("is false for empty or cleared ratings", () => {
    assert.equal(hasAnyFilmRating({}), false);
    assert.equal(hasAnyFilmRating({ a: null }), false);
    assert.equal(hasAnyFilmRating(undefined), false);
  });

  it("is true when any finite rating exists", () => {
    assert.equal(hasAnyFilmRating({ a: null, b: 7 }), true);
  });
});
