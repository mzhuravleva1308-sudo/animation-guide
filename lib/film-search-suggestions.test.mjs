import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSearchSuggestions } from "./film-search-suggestions.mjs";

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
  },
];

describe("getSearchSuggestions", () => {
  it("returns title suggestions for partial queries", () => {
    const suggestions = getSearchSuggestions(sampleFilms, "perse");
    assert.ok(suggestions.some((item) => item.label === "Persepolis"));
    assert.ok(suggestions[0].label === "Persepolis");
  });

  it("returns director, country, and tag suggestions", () => {
    const byDirector = getSearchSuggestions(sampleFilms, "satrapi");
    assert.ok(byDirector.some((item) => item.type === "director"));

    const byCountry = getSearchSuggestions(sampleFilms, "fran");
    assert.ok(byCountry.some((item) => item.label === "France"));

    const byMood = getSearchSuggestions(sampleFilms, "melan");
    assert.ok(byMood.some((item) => item.label === "melancholic"));
  });

  it("limits suggestions to eight items", () => {
    const manyFilms = Array.from({ length: 12 }, (_, index) => ({
      ...sampleFilms[0],
      id: String(index),
      moods: [`melancholic-${index}`],
    }));
    const suggestions = getSearchSuggestions(manyFilms, "melan", { limit: 8 });
    assert.equal(suggestions.length, 8);
  });

  it("returns no suggestions for very short queries", () => {
    assert.deepEqual(getSearchSuggestions(sampleFilms, "p"), []);
  });
});
