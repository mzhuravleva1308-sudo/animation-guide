import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareColdStartScoredFilms,
  diversityRerankColdStartFilms,
  sortFilmsByColdStart,
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
