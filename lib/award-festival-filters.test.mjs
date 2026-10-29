import assert from "node:assert/strict";
import test from "node:test";
import {
  AWARD_FESTIVAL_FILTERS,
  AWARD_FESTIVAL_MIN_FILMS,
  filmMatchesAwardFestivalFilter,
  getAwardFestivalFiltersForFilms,
  isAwardFestivalFilter,
} from "./award-festival-filters.mjs";

test("award festival picker starts with core animation majors", () => {
  assert.deepEqual(
    AWARD_FESTIVAL_FILTERS.slice(0, 5).map((row) => row.id),
    ["annecy", "ottawa", "zagreb", "stuttgart", "cannes"]
  );
  assert.equal(AWARD_FESTIVAL_MIN_FILMS, 11);
});

test("isAwardFestivalFilter recognizes badge ids only", () => {
  assert.equal(isAwardFestivalFilter("annecy"), true);
  assert.equal(isAwardFestivalFilter("award-winners"), false);
  assert.equal(isAwardFestivalFilter("tokyo_anime"), false);
});

test("filmMatchesAwardFestivalFilter uses festival badges", () => {
  const film = {
    festival_badges: [{ id: "annecy" }, { id: "cannes" }],
  };
  assert.equal(filmMatchesAwardFestivalFilter(film, "annecy"), true);
  assert.equal(filmMatchesAwardFestivalFilter(film, "tiff"), false);
  assert.equal(filmMatchesAwardFestivalFilter({}, "annecy"), false);
});

test("getAwardFestivalFiltersForFilms keeps festivals above the threshold", () => {
  const films = Array.from({ length: 12 }, (_, index) => ({
    festival_badges: [
      ...(index < 5 ? [{ id: "ottawa" }] : []),
    ],
  }));
  // Eleven venice-only films clear the threshold; ottawa stays under it.
  for (let i = 0; i < 11; i += 1) {
    films.push({ festival_badges: [{ id: "venice" }] });
  }

  assert.deepEqual(
    getAwardFestivalFiltersForFilms(films).map((row) => row.id),
    ["annecy", "cannes", "venice", "berlinale", "tiff", "sundance"]
  );
});
