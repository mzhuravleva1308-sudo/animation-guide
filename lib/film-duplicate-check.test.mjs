import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareYears,
  evaluateDuplicate,
  findFilmDuplicates,
  getTitleSimilarity,
  normalizeFilmString,
  shouldBlockInsert,
} from "./film-duplicate-check.mjs";

describe("normalizeFilmString", () => {
  it("lowercases, trims, and removes punctuation", () => {
    assert.equal(normalizeFilmString("  Hello, World!  "), "hello world");
  });

  it("normalizes ampersand and and variants", () => {
    assert.equal(normalizeFilmString("Mary & Max"), "mary and max");
    assert.equal(normalizeFilmString("Mary and Max"), "mary and max");
  });

  it("removes common leading articles", () => {
    assert.equal(
      normalizeFilmString("The Triplets of Belleville"),
      "triplets of belleville"
    );
    assert.equal(
      normalizeFilmString("Triplets of Belleville"),
      "triplets of belleville"
    );
    assert.equal(normalizeFilmString("Les Triplettes de Belleville"), "triplettes de belleville");
  });

  it("collapses whitespace", () => {
    assert.equal(normalizeFilmString("Mary    and   Max"), "mary and max");
  });
});

describe("getTitleSimilarity", () => {
  it("treats Mary and Max and Mary & Max as very similar", () => {
    const score = getTitleSimilarity("Mary and Max", "Mary & Max");
    assert.ok(score >= 95);
  });

  it("treats article differences as very similar", () => {
    const score = getTitleSimilarity(
      "The Triplets of Belleville",
      "Triplets of Belleville"
    );
    assert.ok(score >= 95);
  });
});

describe("evaluateDuplicate", () => {
  it("flags same title with same year as hard duplicate", () => {
    const match = evaluateDuplicate(
      { title: "Mary and Max", year: 2009, director: "Adam Elliot" },
      { id: "1", title: "Mary & Max", year: 2009, director: "Adam Elliot" }
    );

    assert.ok(match);
    assert.equal(match.isHardDuplicate, true);
    assert.ok(match.score >= 95);
  });

  it("flags original_title match with similar director", () => {
    const match = evaluateDuplicate(
      {
        title: "The Red Turtle",
        original_title: "La Tortue Rouge",
        director: "Michael Dudok de Wit",
        year: 2016,
      },
      {
        id: "1",
        title: "La Tortue Rouge",
        original_title: "La Tortue Rouge",
        director: "Michael Dudok de Wit",
        year: 2016,
      }
    );

    assert.ok(match);
    assert.ok(match.score >= 70);
    assert.match(match.reasons.join(" "), /original title|similar title/i);
  });

  it("does not block aggressively when year and director differ", () => {
    const match = evaluateDuplicate(
      { title: "Waves", year: 2010, director: "Alice Smith" },
      { id: "1", title: "Wave", year: 2018, director: "Bob Jones" }
    );

    assert.equal(match, null);
  });

  it("treats matching external IDs as hard duplicates", () => {
    const match = evaluateDuplicate(
      { title: "Different Title", tmdb_id: 12345 },
      { id: "1", title: "Another Title", tmdb_id: 12345 }
    );

    assert.ok(match);
    assert.equal(match.isHardDuplicate, true);
    assert.match(match.reasons.join(" "), /tmdb_id/);
  });

  it("allows close year matches for similar titles", () => {
    const match = evaluateDuplicate(
      { title: "Mary and Max", year: 2009, director: "Adam Elliot" },
      { id: "1", title: "Mary & Max", year: 2010, director: "Adam Elliot" }
    );

    assert.ok(match);
    assert.equal(match.isHardDuplicate, false);
    assert.ok(match.reasons.some((reason) => reason.includes("year within 1")));
  });
});

describe("findFilmDuplicates", () => {
  it("returns the strongest match first", () => {
    const matches = findFilmDuplicates(
      { title: "Mary and Max", year: 2009, director: "Adam Elliot" },
      [
        { id: "1", title: "Unrelated Film", year: 2001 },
        { id: "2", title: "Mary & Max", year: 2009, director: "Adam Elliot" },
      ]
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0].existingFilm.id, "2");
  });
});

describe("compareYears", () => {
  it("classifies year differences", () => {
    assert.equal(compareYears(2009, 2009), "same");
    assert.equal(compareYears(2009, 2010), "close");
    assert.equal(compareYears(2009, 2012), "far");
    assert.equal(compareYears(null, 2009), "unknown");
  });
});

describe("shouldBlockInsert", () => {
  it("blocks hard duplicates by default", () => {
    const matches = [
      {
        existingFilm: { id: "1", title: "Mary & Max" },
        score: 100,
        isHardDuplicate: true,
        reasons: ["exact normalized title match", "same year"],
      },
    ];

    const result = shouldBlockInsert(matches);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "hard_duplicate");
  });

  it("allows possible duplicates with override flag", () => {
    const matches = [
      {
        existingFilm: { id: "1", title: "Mary & Max" },
        score: 82,
        isHardDuplicate: false,
        reasons: ["similar title (82% match)", "same year"],
      },
    ];

    const blocked = shouldBlockInsert(matches);
    assert.equal(blocked.blocked, true);

    const allowed = shouldBlockInsert(matches, {
      allowPossibleDuplicates: true,
    });
    assert.equal(allowed.blocked, false);
  });

  it("requires force flag for hard duplicates", () => {
    const matches = [
      {
        existingFilm: { id: "1", title: "Mary & Max" },
        score: 100,
        isHardDuplicate: true,
        reasons: ["exact normalized title match", "same year"],
      },
    ];

    const allowedPossible = shouldBlockInsert(matches, {
      allowPossibleDuplicates: true,
    });
    assert.equal(allowedPossible.blocked, true);

    const forced = shouldBlockInsert(matches, {
      forceExactDuplicate: true,
    });
    assert.equal(forced.blocked, false);
  });
});
