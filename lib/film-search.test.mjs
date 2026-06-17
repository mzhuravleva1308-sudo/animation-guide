import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getFuzzyTextSimilarity,
  isSearchQueryUsable,
  normalizeSearchQuery,
  searchFilms,
} from "./film-search.mjs";

const sampleFilms = [
  {
    id: "1",
    title: "Persepolis",
    original_title: "Persepolis",
    director: "Marjane Satrapi",
    year: 2007,
    country: "France",
    technique: "2D animation",
    moods: ["melancholic", "coming of age"],
    aesthetic_tags: ["ink drawing"],
    narrative_tags: ["autobiographical"],
    synopsis: "A young girl grows up during the Iranian Revolution.",
  },
  {
    id: "2",
    title: "The Triplets of Belleville",
    original_title: "Les Triplettes de Belleville",
    director: "Sylvain Chomet",
    year: 2003,
    country: "France",
    technique: "hand-drawn",
    moods: ["whimsical"],
    aesthetic_tags: ["retro"],
    narrative_tags: ["rescue quest"],
    synopsis: "A grandmother searches for her kidnapped grandson.",
  },
];

describe("normalizeSearchQuery", () => {
  it("normalizes whitespace and punctuation", () => {
    assert.equal(normalizeSearchQuery("  Persepolis!  "), "persepolis");
  });
});

describe("isSearchQueryUsable", () => {
  it("requires at least two characters", () => {
    assert.equal(isSearchQueryUsable("a"), false);
    assert.equal(isSearchQueryUsable("ab"), true);
  });
});

describe("getFuzzyTextSimilarity", () => {
  it("matches typo variants like persepolis and persopolis", () => {
    const similarity = getFuzzyTextSimilarity("persopolis", "persepolis");
    assert.ok(similarity >= 70);
  });

  it("supports partial title matches", () => {
    const similarity = getFuzzyTextSimilarity("perse", "persepolis");
    assert.ok(similarity >= 75);
  });
});

describe("searchFilms", () => {
  it("finds films by partial title", () => {
    const results = searchFilms(sampleFilms, "perse");
    assert.equal(results.length, 1);
    assert.equal(results[0].film.title, "Persepolis");
    assert.ok(results[0].matchedFields.includes("title"));
  });

  it("finds films by misspelled title", () => {
    const results = searchFilms(sampleFilms, "persopolis");
    assert.equal(results.length, 1);
    assert.equal(results[0].film.title, "Persepolis");
  });

  it("finds films by director and tags", () => {
    const byDirector = searchFilms(sampleFilms, "satrapi");
    assert.equal(byDirector[0].film.title, "Persepolis");

    const byMood = searchFilms(sampleFilms, "melancholic");
    assert.equal(byMood[0].film.title, "Persepolis");

    const byTechnique = searchFilms(sampleFilms, "hand drawn");
    assert.equal(byTechnique[0].film.title, "The Triplets of Belleville");
  });

  it("finds films by year", () => {
    const results = searchFilms(sampleFilms, "2007");
    assert.equal(results.length, 1);
    assert.equal(results[0].film.title, "Persepolis");
  });

  it("returns empty results for very short queries", () => {
    assert.deepEqual(searchFilms(sampleFilms, "p"), []);
  });
});
