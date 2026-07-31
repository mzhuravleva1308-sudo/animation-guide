import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBalancedScores,
  compareColdStartScoredFilms,
  diversityRerankColdStartFilms,
  sortFilmsByColdStart,
  sortFilmsByScore,
  sortFilmsForDualModeCatalog,
} from "./profile-film-scoring.mjs";

describe("sortFilmsByColdStart", () => {
  it("orders scored films by cold_start_score descending", () => {
    const films = [
      { id: "b", title: "Beta", cold_start_score: 5 },
      { id: "a", title: "Alpha", cold_start_score: 10 },
      { id: "c", title: "Charlie", cold_start_score: 7 },
    ];

    const sorted = sortFilmsByColdStart(films);

    assert.deepEqual(
      sorted.map((film) => film.id),
      ["a", "c", "b"]
    );
  });

  it("places scored films before unscored films", () => {
    const films = [
      { id: "unscored", title: "Zulu", cold_start_score: null },
      { id: "scored", title: "Alpha", cold_start_score: 3 },
    ];

    const sorted = sortFilmsByColdStart(films);

    assert.deepEqual(
      sorted.map((film) => film.id),
      ["scored", "unscored"]
    );
  });

  it("sorts unscored films by title when scores are missing", () => {
    const films = [
      { id: "2", title: "Bravo", cold_start_score: null },
      { id: "1", title: "Alpha", cold_start_score: null },
    ];

    const sorted = sortFilmsByColdStart(films);

    assert.deepEqual(
      sorted.map((film) => film.title),
      ["Alpha", "Bravo"]
    );
  });
});

describe("diversityRerankColdStartFilms", () => {
  it("avoids back-to-back same director when alternatives exist in the look-ahead window", () => {
    const films = [
      { id: "1", title: "A", director: "Alice", cold_start_score: 10 },
      { id: "2", title: "B", director: "Alice", cold_start_score: 9 },
      { id: "3", title: "C", director: "Bob", cold_start_score: 8 },
    ].sort(compareColdStartScoredFilms);

    const reranked = diversityRerankColdStartFilms(films);

    assert.deepEqual(
      reranked.map((film) => film.id),
      ["1", "3", "2"]
    );
    assert.notEqual(reranked[0].director, reranked[1].director);
  });

  it("keeps score order when no diverse alternative is available", () => {
    const films = [
      { id: "1", title: "A", director: "Alice", cold_start_score: 10 },
      { id: "2", title: "B", director: "Alice", cold_start_score: 9 },
    ].sort(compareColdStartScoredFilms);

    const reranked = diversityRerankColdStartFilms(films, 1);

    assert.deepEqual(
      reranked.map((film) => film.id),
      ["1", "2"]
    );
  });
});

describe("sortFilmsForDualModeCatalog", () => {
  const films = [
    {
      id: "low-cold",
      title: "Low Cold",
      director: "A",
      cold_start_score: 1,
    },
    {
      id: "high-cold",
      title: "High Cold",
      director: "B",
      cold_start_score: 10,
    },
    {
      id: "mid-cold",
      title: "Mid Cold",
      director: "C",
      cold_start_score: 5,
    },
  ];

  const smartScoreRows = [
    {
      film_id: "low-cold",
      emotional_score: 10,
      material_score: 10,
    },
    {
      film_id: "high-cold",
      emotional_score: 1,
      material_score: 1,
    },
    {
      film_id: "mid-cold",
      emotional_score: 5,
      material_score: 5,
    },
  ];

  const coldStartOrder = sortFilmsByColdStart(films).map((film) => film.id);
  const smartOrder = sortFilmsByScore(
    films,
    buildBalancedScores(
      films,
      new Map(
        smartScoreRows.map((row) => [
          row.film_id,
          {
            emotional: row.emotional_score,
            material: row.material_score,
          },
        ])
      )
    )
  ).map((film) => film.id);

  it("1) guest always uses cold-start", () => {
    const result = sortFilmsForDualModeCatalog({
      films,
      viewer: "guest",
      ratings: [{ film_id: "liked", rating: 10 }],
      scoreRows: smartScoreRows,
    });

    assert.equal(result.mode, "cold-start");
    assert.equal(result.reason, "guest");
    assert.deepEqual(
      result.films.map((film) => film.id),
      coldStartOrder
    );
    assert.notDeepEqual(coldStartOrder, smartOrder);
  });

  it("2) authenticated user with no ratings >= 7 uses cold-start", () => {
    const result = sortFilmsForDualModeCatalog({
      films,
      viewer: "authenticated",
      ratings: [
        { film_id: "a", rating: 5 },
        { film_id: "b", rating: 6 },
      ],
      scoreRows: smartScoreRows,
    });

    assert.equal(result.mode, "cold-start");
    assert.equal(result.reason, "no-high-ratings");
    assert.deepEqual(
      result.films.map((film) => film.id),
      coldStartOrder
    );
  });

  it("3) authenticated user with at least one rating >= 7 uses profile_film_scores / balanced sorting", () => {
    const result = sortFilmsForDualModeCatalog({
      films,
      viewer: "authenticated",
      ratings: [{ film_id: "liked", rating: 7 }],
      scoreRows: smartScoreRows,
    });

    assert.equal(result.mode, "smart");
    assert.equal(result.reason, "profile-scores");
    assert.deepEqual(
      result.films.map((film) => film.id),
      smartOrder
    );
    assert.deepEqual(smartOrder, ["low-cold", "mid-cold", "high-cold"]);
  });

  it("4) rating 6 does not unlock smart mode; rating 7 does", () => {
    const withSix = sortFilmsForDualModeCatalog({
      films,
      viewer: "authenticated",
      ratings: [{ film_id: "almost", rating: 6 }],
      scoreRows: smartScoreRows,
    });
    const withSeven = sortFilmsForDualModeCatalog({
      films,
      viewer: "authenticated",
      ratings: [{ film_id: "liked", rating: 7 }],
      scoreRows: smartScoreRows,
    });

    assert.equal(withSix.mode, "cold-start");
    assert.equal(withSix.reason, "no-high-ratings");
    assert.deepEqual(
      withSix.films.map((film) => film.id),
      coldStartOrder
    );

    assert.equal(withSeven.mode, "smart");
    assert.equal(withSeven.reason, "profile-scores");
    assert.deepEqual(
      withSeven.films.map((film) => film.id),
      smartOrder
    );
  });

  it("falls back to cold-start when smart mode is required but scores are empty or unavailable", () => {
    const emptyScores = sortFilmsForDualModeCatalog({
      films,
      viewer: "authenticated",
      ratings: [{ film_id: "liked", rating: 9 }],
      scoreRows: [],
    });
    const unavailableScores = sortFilmsForDualModeCatalog({
      films,
      viewer: "authenticated",
      ratings: [{ film_id: "liked", rating: 9 }],
      scoreRows: smartScoreRows,
      scoresUnavailable: true,
    });
    const nullScores = sortFilmsForDualModeCatalog({
      films,
      viewer: "authenticated",
      ratings: [{ film_id: "liked", rating: 9 }],
      scoreRows: null,
    });

    assert.equal(emptyScores.mode, "cold-start");
    assert.equal(emptyScores.reason, "smart-scores-unavailable");
    assert.equal(emptyScores.scoresFallbackCause, "empty-scores");
    assert.deepEqual(
      emptyScores.films.map((film) => film.id),
      coldStartOrder
    );

    assert.equal(unavailableScores.mode, "cold-start");
    assert.equal(unavailableScores.reason, "smart-scores-unavailable");
    assert.equal(unavailableScores.scoresFallbackCause, "query-error");
    assert.deepEqual(
      unavailableScores.films.map((film) => film.id),
      coldStartOrder
    );

    assert.equal(nullScores.mode, "cold-start");
    assert.equal(nullScores.reason, "smart-scores-unavailable");
    assert.equal(nullScores.scoresFallbackCause, "empty-scores");
    assert.deepEqual(
      nullScores.films.map((film) => film.id),
      coldStartOrder
    );
  });
});
