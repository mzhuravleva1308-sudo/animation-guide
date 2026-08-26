import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  likeIdsOnAnyAxis,
  primaryAnchorId,
  rankBaseline,
  rankPerLikeByPairScore,
  rankPerLikeInterleave,
  rankSameAnchorCap,
  sortLikesForPull,
  axesScoreAgainstLike,
  threeAxisScoreAgainstLike,
  uniqueAnchorsInTop,
} from "./experiment-per-like-ranking.mjs";

function film(id, title) {
  return { id, title };
}

function scores(entries) {
  return new Map(
    entries.map(([id, balanced]) => [id, { balanced }])
  );
}

function gatedEmotional(anchorId, title = anchorId) {
  return {
    emotionalAnchor: { anchorFilmId: anchorId, anchorTitle: title },
    visualWorldAnchor: { anchorFilmId: null, anchorTitle: null },
    storytellingAnchor: { anchorFilmId: null, anchorTitle: null },
  };
}

describe("sortLikesForPull", () => {
  it("puts higher ratings first, then title", () => {
    const ordered = sortLikesForPull([
      { id: "b", title: "Wild", rating: 9 },
      { id: "a", title: "Les Choristes", rating: 9 },
      { id: "c", title: "Women", rating: 8 },
    ]);
    assert.deepEqual(
      ordered.map((row) => row.id),
      ["a", "b", "c"]
    );
  });
});

describe("rankSameAnchorCap", () => {
  it("defers a third film with the same emotional anchor out of the top window", () => {
    const films = [
      film("1", "Graduation"),
      film("2", "Beale Street"),
      film("3", "Murina"),
      film("4", "Farewell"),
    ];
    const balanced = scores([
      ["1", 0.9],
      ["2", 0.8],
      ["3", 0.7],
      ["4", 0.6],
    ]);
    const gatedById = new Map([
      ["1", gatedEmotional("choristes", "Les Choristes")],
      ["2", gatedEmotional("choristes", "Les Choristes")],
      ["3", gatedEmotional("choristes", "Les Choristes")],
      ["4", gatedEmotional("women", "20th Century Women")],
    ]);

    const ranked = rankSameAnchorCap(films, balanced, gatedById, {
      windowSize: 3,
      maxPerAnchor: 2,
    });

    assert.deepEqual(
      ranked.map((row) => row.title),
      ["Graduation", "Beale Street", "Farewell", "Murina"]
    );
  });
});

describe("rankPerLikeInterleave", () => {
  it("lets each like pull its anchored neighbor before score order", () => {
    const likes = [
      { id: "choristes", title: "Les Choristes", rating: 9 },
      { id: "women", title: "20th Century Women", rating: 8 },
    ];
    const candidates = [
      film("g", "Graduation"),
      film("f", "The Farewell"),
      film("m", "Murina"),
    ];
    const balanced = scores([
      ["g", 0.9],
      ["m", 0.8],
      ["f", 0.5],
    ]);
    const gatedById = new Map([
      ["g", gatedEmotional("choristes", "Les Choristes")],
      ["m", gatedEmotional("choristes", "Les Choristes")],
      [
        "f",
        {
          emotionalAnchor: {
            anchorFilmId: "choristes",
            anchorTitle: "Les Choristes",
          },
          visualWorldAnchor: {
            anchorFilmId: "women",
            anchorTitle: "20th Century Women",
          },
          storytellingAnchor: {
            anchorFilmId: "women",
            anchorTitle: "20th Century Women",
          },
        },
      ],
    ]);

    const { films, pulled } = rankPerLikeInterleave({
      likes,
      candidates,
      balancedScores: balanced,
      gatedById,
      similarityToLike: () => 0,
      limit: 2,
    });

    assert.equal(pulled[0].film.title, "Graduation");
    assert.equal(pulled[0].pulledBy.title, "Les Choristes");
    assert.equal(pulled[1].film.title, "The Farewell");
    assert.equal(pulled[1].pulledBy.title, "20th Century Women");
    assert.equal(films[0].title, "Graduation");
    assert.equal(films[1].title, "The Farewell");
  });

  it("falls back to similarity when a like never wins nearest-anchor", () => {
    const likes = [{ id: "quiet", title: "The Quiet Girl", rating: 7 }];
    const candidates = [film("a", "Alpha"), film("b", "Beta")];
    const balanced = scores([
      ["a", 0.2],
      ["b", 0.9],
    ]);
    const gatedById = new Map([
      ["a", gatedEmotional("other")],
      ["b", gatedEmotional("other")],
    ]);
    const { pulled } = rankPerLikeInterleave({
      likes,
      candidates,
      balancedScores: balanced,
      gatedById,
      similarityToLike: (candidateId, likeId) => {
        if (likeId !== "quiet") return 0;
        return candidateId === "a" ? 0.99 : 0.1;
      },
      limit: 1,
    });

    assert.equal(pulled[0].film.title, "Alpha");
    assert.equal(pulled[0].viaAnchor, false);
  });
});

describe("rankPerLikeByPairScore", () => {
  it("picks the candidate closest to that like on the pair 3-axis score", () => {
    const likes = [
      { id: "choristes", title: "Les Choristes", rating: 9 },
      { id: "women", title: "20th Century Women", rating: 8 },
    ];
    const candidates = [
      film("g", "Graduation"),
      film("f", "The Farewell"),
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
});

describe("helpers", () => {
  it("collects unique emotional anchors in a prefix", () => {
    const films = [film("1", "A"), film("2", "B")];
    const gatedById = new Map([
      ["1", gatedEmotional("x", "X")],
      ["2", gatedEmotional("y", "Y")],
    ]);
    const { titles } = uniqueAnchorsInTop(films, gatedById, 7);
    assert.deepEqual([...titles].sort(), ["X", "Y"]);
  });

  it("likeIdsOnAnyAxis includes vw/st anchors", () => {
    const ids = likeIdsOnAnyAxis({
      emotionalAnchor: { anchorFilmId: "e" },
      visualWorldAnchor: { anchorFilmId: "v" },
      storytellingAnchor: { anchorFilmId: null },
    });
    assert.equal(ids.has("e"), true);
    assert.equal(ids.has("v"), true);
  });

  it("rankBaseline follows balanced scores", () => {
    const films = [film("a", "A"), film("b", "B")];
    const ranked = rankBaseline(
      films,
      scores([
        ["a", 0.1],
        ["b", 0.9],
      ])
    );
    assert.equal(ranked[0].id, "b");
  });

  it("primaryAnchorId uses emotional nearest", () => {
    assert.equal(primaryAnchorId(gatedEmotional("x")), "x");
    assert.equal(primaryAnchorId(null), null);
  });

  it("threeAxisScoreAgainstLike averages three axes then applies the gate", () => {
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

  it("axesScoreAgainstLike averages two animation axes then applies the gate", () => {
    const ungated = axesScoreAgainstLike({
      sims: [1, 1],
      likeRating: 8,
      profileGate: 1,
    });
    const gated = axesScoreAgainstLike({
      sims: [1, 1],
      likeRating: 8,
      profileGate: 0.45,
    });
    assert.equal(Number(ungated.toFixed(4)), 0.75);
    assert.equal(Number(gated.toFixed(4)), Number((0.75 * 0.45).toFixed(4)));
  });
});
