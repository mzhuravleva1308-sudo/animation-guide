import assert from "node:assert/strict";
import test from "node:test";
import { selectCandidateFilmsForScoring } from "./profile-film-score-candidates.mjs";

const films = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
  { id: "c", title: "C" },
];

test("selectCandidateFilmsForScoring excludes rated films", () => {
  const candidates = selectCandidateFilmsForScoring(films, [
    { film_id: "b", rating: 8 },
  ]);
  assert.deepEqual(
    candidates.map((film) => film.id),
    ["a", "c"]
  );
});

test("selectCandidateFilmsForScoring restricts to new film ids", () => {
  const candidates = selectCandidateFilmsForScoring(
    films,
    [{ film_id: "a", rating: 9 }],
    ["b", "c", "missing"]
  );
  assert.deepEqual(
    candidates.map((film) => film.id),
    ["b", "c"]
  );
});

test("selectCandidateFilmsForScoring returns empty when restrict set is already rated", () => {
  const candidates = selectCandidateFilmsForScoring(
    films,
    [{ film_id: "b", rating: 7 }],
    ["b"]
  );
  assert.deepEqual(candidates, []);
});
