import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FRESH_TASTE_PICKS_ALLOWLIST_EMAILS,
  FRESH_TASTE_PICKS_LIMIT,
  FRESH_TASTE_PICKS_SECOND_MIN_RATIO,
  FRESH_TASTE_PICKS_WINDOW_MS,
  canAccessFreshTastePicks,
  freshTastePicksSinceIso,
  isSecondFreshPickCloseEnough,
  mergeRecentCatalogFilmIds,
  selectFreshTastePicks,
} from "./fresh-taste-picks.mjs";

const films = [
  { id: "old-high", title: "Old High" },
  { id: "new-mid", title: "New Mid" },
  { id: "new-high", title: "New High" },
  { id: "new-low", title: "New Low" },
  { id: "new-near", title: "New Near" },
];

const scoreRows = [
  {
    film_id: "old-high",
    emotional_score: 100,
    material_score: 100,
    visual_world_score: 0,
    storytelling_score: 0,
  },
  {
    film_id: "new-high",
    emotional_score: 90,
    material_score: 90,
    visual_world_score: 0,
    storytelling_score: 0,
  },
  {
    film_id: "new-near",
    emotional_score: 86,
    material_score: 86,
    visual_world_score: 0,
    storytelling_score: 0,
  },
  {
    film_id: "new-mid",
    emotional_score: 50,
    material_score: 50,
    visual_world_score: 0,
    storytelling_score: 0,
  },
  {
    film_id: "new-low",
    emotional_score: 10,
    material_score: 10,
    visual_world_score: 0,
    storytelling_score: 0,
  },
];

const likedRatings = [{ film_id: "liked", rating: 8, media_type: "animation" }];

describe("freshTastePicksSinceIso", () => {
  it("returns an ISO ~30 days before now", () => {
    const now = Date.parse("2026-04-15T12:00:00.000Z");
    const since = freshTastePicksSinceIso(now);
    assert.equal(
      Date.parse(since),
      now - FRESH_TASTE_PICKS_WINDOW_MS
    );
  });
});

describe("mergeRecentCatalogFilmIds", () => {
  it("unions batch and created_at sources and drops empties", () => {
    const merged = mergeRecentCatalogFilmIds(
      ["a", "b", null, ""],
      ["b", "c", undefined]
    );
    assert.deepEqual([...merged].sort(), ["a", "b", "c"]);
  });
});

describe("canAccessFreshTastePicks", () => {
  it("allows only preview allowlisted emails", () => {
    assert.ok(
      FRESH_TASTE_PICKS_ALLOWLIST_EMAILS.includes("mzhuravleva1308@gmail.com")
    );
    assert.equal(
      canAccessFreshTastePicks({ email: "mzhuravleva1308@gmail.com" }),
      true
    );
    assert.equal(
      canAccessFreshTastePicks({ email: "  MZhuravleva1308@gmail.com " }),
      true
    );
    assert.equal(
      canAccessFreshTastePicks({ email: "someone@else.com" }),
      false
    );
    assert.equal(canAccessFreshTastePicks({ email: null }), false);
    assert.equal(canAccessFreshTastePicks(null), false);
  });
});

describe("isSecondFreshPickCloseEnough", () => {
  it("accepts a runner-up within the default ratio of the top score", () => {
    assert.equal(isSecondFreshPickCloseEnough(1, FRESH_TASTE_PICKS_SECOND_MIN_RATIO), true);
    assert.equal(isSecondFreshPickCloseEnough(0.9, 0.9 * FRESH_TASTE_PICKS_SECOND_MIN_RATIO), true);
  });

  it("rejects a runner-up that falls below the ratio", () => {
    assert.equal(isSecondFreshPickCloseEnough(1, FRESH_TASTE_PICKS_SECOND_MIN_RATIO - 0.01), false);
  });
});

describe("selectFreshTastePicks", () => {
  it("always returns the best recent match", () => {
    const picks = selectFreshTastePicks({
      films,
      recentFilmIds: new Set(["new-mid", "new-high", "new-low"]),
      ratings: likedRatings,
      scoreRows,
      mediaType: "animation",
      scoreMode: "native",
      sourceMedia: "animation",
    });

    assert.deepEqual(
      picks.map((film) => film.id),
      ["new-high"]
    );
  });

  it("includes a second pick only when its score is close to the top", () => {
    const picks = selectFreshTastePicks({
      films,
      recentFilmIds: new Set(["new-high", "new-near", "new-low"]),
      ratings: likedRatings,
      scoreRows,
      mediaType: "animation",
      scoreMode: "native",
      sourceMedia: "animation",
    });

    assert.deepEqual(
      picks.map((film) => film.id),
      ["new-high", "new-near"]
    );
    assert.ok(picks.length <= FRESH_TASTE_PICKS_LIMIT);
  });

  it("omits a distant second even when two recent films exist", () => {
    const picks = selectFreshTastePicks({
      films,
      recentFilmIds: new Set(["new-high", "new-mid"]),
      ratings: likedRatings,
      scoreRows,
      mediaType: "animation",
      scoreMode: "native",
      sourceMedia: "animation",
    });

    assert.deepEqual(
      picks.map((film) => film.id),
      ["new-high"]
    );
  });

  it("ignores older catalog films even when they score higher", () => {
    const picks = selectFreshTastePicks({
      films,
      recentFilmIds: new Set(["new-low"]),
      ratings: likedRatings,
      scoreRows,
      mediaType: "animation",
      scoreMode: "native",
      sourceMedia: "animation",
    });

    assert.deepEqual(
      picks.map((film) => film.id),
      ["new-low"]
    );
  });

  it("returns empty when the viewer lacks high ratings", () => {
    const picks = selectFreshTastePicks({
      films,
      recentFilmIds: new Set(["new-high"]),
      ratings: [{ film_id: "x", rating: 6, media_type: "animation" }],
      scoreRows,
      mediaType: "animation",
      scoreMode: "native",
      sourceMedia: "animation",
    });
    assert.deepEqual(picks, []);
  });

  it("returns empty when scores are unavailable or empty", () => {
    assert.deepEqual(
      selectFreshTastePicks({
        films,
        recentFilmIds: new Set(["new-high"]),
        ratings: likedRatings,
        scoreRows,
        scoresUnavailable: true,
        mediaType: "animation",
      }),
      []
    );
    assert.deepEqual(
      selectFreshTastePicks({
        films,
        recentFilmIds: new Set(["new-high"]),
        ratings: likedRatings,
        scoreRows: [],
        mediaType: "animation",
      }),
      []
    );
  });

  it("returns empty when no recent ids overlap the pool", () => {
    const picks = selectFreshTastePicks({
      films,
      recentFilmIds: new Set(["someone-else"]),
      ratings: likedRatings,
      scoreRows,
      mediaType: "animation",
    });
    assert.deepEqual(picks, []);
  });
});
