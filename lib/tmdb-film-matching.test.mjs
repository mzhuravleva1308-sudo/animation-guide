import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVideoLanguageList,
  evaluateTmdbMatch,
  fetchTmdbMovieDetails,
} from "./tmdb-film-matching.mjs";

const film = {
  title: "Example Film",
  original_title: "Example Original",
  year: 2020,
  director: "Jane Doe",
  country: "France",
  synopsis: "A young artist returns to a coastal village and rebuilds her life.",
};

test("builds French video language list without duplicates", () => {
  assert.deepEqual(buildVideoLanguageList("fr"), ["en", "fr", "null"]);
});

test("builds English video language list without duplicate en", () => {
  assert.deepEqual(buildVideoLanguageList("en"), ["en", "null"]);
});

test("builds Japanese video language list", () => {
  assert.deepEqual(buildVideoLanguageList("ja"), ["en", "ja", "null"]);
});

test("falls back to English and null when original language is missing", () => {
  assert.deepEqual(buildVideoLanguageList(null), ["en", "null"]);
});

function result(year, overrides = {}) {
  return {
    title: "Example Film",
    original_title: "Example Original",
    release_date: `${year}-01-01`,
    overview: film.synopsis,
    genre_ids: [16],
    director_names: ["Jane Doe"],
    production_countries: ["France"],
    ...overrides,
  };
}

test("accepts an exact year match with strong evidence", () => {
  const evaluation = evaluateTmdbMatch(film, result(2020));

  assert.equal(evaluation.accepted, true);
  assert.match(evaluation.reason, /year difference 0/);
});

test("accepts a one-year difference with strong evidence", () => {
  const evaluation = evaluateTmdbMatch(film, result(2021));

  assert.equal(evaluation.accepted, true);
  assert.match(evaluation.reason, /year difference 1 is compatible/);
});

test("requires two strong signals for a two-year difference", () => {
  const accepted = evaluateTmdbMatch(film, result(2022, {
    director_names: ["Jane Doe"],
    production_countries: ["France"],
  }));
  const rejected = evaluateTmdbMatch(
    film,
    result(2022, {
      original_title: "Different Original",
      overview: "An unrelated story.",
      director_names: [],
      production_countries: [],
    })
  );

  assert.equal(accepted.accepted, true);
  assert.equal(rejected.accepted, false);
  assert.match(rejected.reason, /two-year difference requires/);
});

test("rejects a difference greater than two years", () => {
  const evaluation = evaluateTmdbMatch(film, result(2023));

  assert.equal(evaluation.accepted, false);
  assert.match(evaluation.reason, /greater than 2/);
});

test("rejects a title-only match", () => {
  const evaluation = evaluateTmdbMatch(
    film,
    result(2020, {
      original_title: "Different Original",
      overview: "An unrelated story.",
      genre_ids: [],
      director_names: [],
      production_countries: [],
    })
  );

  assert.equal(evaluation.accepted, false);
  assert.match(evaluation.reason, /title-only match/);
});

test("requests multiple video languages so French trailers are not hidden", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      async json() {
        return { credits: { crew: [] } };
      },
    };
  };

  try {
    await fetchTmdbMovieDetails("test-key", 947502, "credits,videos", {
      includeVideoLanguage: "en,fr,null",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestedUrl, /include_video_language=en%2Cfr%2Cnull/);
});
