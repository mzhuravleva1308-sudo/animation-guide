import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEDIA_TYPE } from "./media-type.mjs";
import {
  getRatingOnboardingHint,
  hasAnyFilmRating,
  hasLikedHighFilmRating,
  ratingOnboardingHintsDismissedStorageKey,
  readRatingOnboardingHintsDismissed,
  writeRatingOnboardingHintsDismissed,
  RATING_ONBOARDING_HINTS_DISMISSED_STORAGE_KEY,
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

describe("hasLikedHighFilmRating", () => {
  it("is false without a 7+ rating", () => {
    assert.equal(hasLikedHighFilmRating({}), false);
    assert.equal(hasLikedHighFilmRating({ a: null, b: 6 }), false);
    assert.equal(hasLikedHighFilmRating(undefined), false);
  });

  it("is true for a 7+ rating", () => {
    assert.equal(hasLikedHighFilmRating({ a: 6, b: 7 }), true);
  });

  it("scopes to the provided media film IDs", () => {
    const ratings = {
      animationFilm: 9,
      liveActionFilm: 5,
    };

    assert.equal(
      hasLikedHighFilmRating(ratings, { filmIds: ["animationFilm"] }),
      true
    );
    assert.equal(
      hasLikedHighFilmRating(ratings, { filmIds: ["liveActionFilm"] }),
      false
    );
    assert.equal(
      hasLikedHighFilmRating(ratings, {
        filmIds: ["liveActionFilm"],
        threshold: 5,
      }),
      true
    );
  });
});

describe("rating onboarding dismiss storage", () => {
  it("uses independent keys per media type", () => {
    assert.notEqual(
      ratingOnboardingHintsDismissedStorageKey(MEDIA_TYPE.animation),
      ratingOnboardingHintsDismissedStorageKey(MEDIA_TYPE.liveAction)
    );
  });

  it("does not let animation legacy dismiss hide live-action hints", () => {
    const store = new Map();
    globalThis.window = {
      localStorage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => {
          store.set(key, String(value));
        },
      },
    };

    store.set(RATING_ONBOARDING_HINTS_DISMISSED_STORAGE_KEY, "1");

    assert.equal(
      readRatingOnboardingHintsDismissed(MEDIA_TYPE.animation),
      true
    );
    assert.equal(
      readRatingOnboardingHintsDismissed(MEDIA_TYPE.liveAction),
      false
    );

    writeRatingOnboardingHintsDismissed(MEDIA_TYPE.liveAction);
    assert.equal(
      readRatingOnboardingHintsDismissed(MEDIA_TYPE.liveAction),
      true
    );
    assert.equal(
      store.get(
        ratingOnboardingHintsDismissedStorageKey(MEDIA_TYPE.liveAction)
      ),
      "1"
    );

    delete globalThis.window;
  });
});
