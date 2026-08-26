import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLiveActionScoreAgainstLike,
  perLikePullLimit,
  rankPerLikeByPairScore,
  threeAxisScoreAgainstLike,
} from "./per-like-catalog-ranking.mjs";

describe("per-like-catalog-ranking", () => {
  it("threeAxisScoreAgainstLike averages axes then applies the gate", () => {
    const ungated = threeAxisScoreAgainstLike({
      emotionalSim: 1,
      visualWorldSim: 1,
      storytellingSim: 1,
      likeRating: 8,
      profileGate: 1,
    });
    const gated = threeAxisScoreAgainstLike({
      emotionalSim: 1,
      visualWorldSim: 1,
      storytellingSim: 1,
      likeRating: 8,
      profileGate: 0.45,
    });
    assert.equal(Number(ungated.toFixed(4)), 0.75);
    assert.equal(Number(gated.toFixed(4)), Number((0.75 * 0.45).toFixed(4)));
  });

  it("rankPerLikeByPairScore lets each like pull its closest unused film", () => {
    const likes = [
      { id: "choristes", title: "Les Choristes", rating: 9 },
      { id: "women", title: "20th Century Women", rating: 8 },
    ];
    const candidates = [
      { id: "g", title: "Graduation" },
      { id: "f", title: "The Farewell" },
    ];
    const pair = {
      "g|choristes": 0.9,
      "f|choristes": 0.4,
      "g|women": 0.5,
      "f|women": 0.88,
    };
    const { pulled } = rankPerLikeByPairScore({
      likes,
      candidates,
      scoreAgainstLike: (candidate, like) => pair[`${candidate.id}|${like.id}`],
      limit: 2,
    });

    assert.equal(pulled[0].film.title, "Graduation");
    assert.equal(pulled[0].pulledBy.title, "Les Choristes");
    assert.equal(pulled[1].film.title, "The Farewell");
    assert.equal(pulled[1].pulledBy.title, "20th Century Women");
  });

  it("buildLiveActionScoreAgainstLike uses cosine on three axes", () => {
    const unit = [1, 0, 0];
    const almost = [0.99, 0.1, 0];
    const scoreAgainstLike = buildLiveActionScoreAgainstLike({
      moodByFilmId: new Map([
        ["c", unit],
        ["l", unit],
      ]),
      visualWorldByFilmId: new Map([
        ["c", unit],
        ["l", almost],
      ]),
      storytellingByFilmId: new Map([
        ["c", unit],
        ["l", unit],
      ]),
    });
    const score = scoreAgainstLike(
      { id: "c", title: "Cand" },
      { id: "l", title: "Like", rating: 9 }
    );
    assert.ok(score > 0.8);
  });

  it("perLikePullLimit is at least 15 and at least like count", () => {
    assert.equal(perLikePullLimit(3), 15);
    assert.equal(perLikePullLimit(20), 20);
  });
});
