import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeFilmCatalog,
  analyzeMetadataHealth,
  countTags,
  CURATION_REGION_CATALOG,
  CURATION_REGION_OTHER,
  findPotentialDuplicateGroups,
  getDecadeLabel,
  hasPoster,
  isEmptyOrUnknownValue,
  isSuspiciousPlaceholderValue,
  normalizeCountryName,
  normalizeTagList,
  splitCountries,
  splitCurationRegions,
  splitTechniques,
  summarizeTagCounts,
} from "./catalog-analytics.mjs";
import { normalizeFilmString } from "./film-duplicate-check.mjs";

const [
  WESTERN_EUROPE,
  CENTRAL_EASTERN_EUROPE,
  BRITISH_ISLES,
  ANGLOPHONE_NORTH_ATLANTIC,
  JAPAN,
  ASIA_EXCL_JAPAN,
  LATIN_AMERICA,
  MIDDLE_EAST_TURKEY,
] = CURATION_REGION_CATALOG.map((entry) => entry.label);

describe("splitCountries", () => {
  it("splits comma-separated countries into individual entries", () => {
    assert.deepEqual(splitCountries("France, Belgium, Canada"), [
      "France",
      "Belgium",
      "Canada",
    ]);
  });

  it("handles slash and and separators", () => {
    assert.deepEqual(splitCountries("France / Belgium and Canada"), [
      "France",
      "Belgium",
      "Canada",
    ]);
  });

  it("ignores empty and unknown values", () => {
    assert.deepEqual(splitCountries("Unknown, , France"), ["France"]);
  });
});

describe("normalizeCountryName", () => {
  it("trims and normalizes spacing", () => {
    assert.equal(normalizeCountryName("  France  "), "France");
  });

  it("returns null for unknown values", () => {
    assert.equal(normalizeCountryName("n/a"), null);
  });

  it("normalizes obvious United States aliases", () => {
    assert.equal(normalizeCountryName("USA"), "United States");
    assert.equal(normalizeCountryName("U.S."), "United States");
    assert.equal(normalizeCountryName("U.S.A."), "United States");
    assert.equal(
      normalizeCountryName("United States of America"),
      "United States"
    );
    assert.equal(normalizeCountryName("United States"), "United States");
  });

  it("normalizes obvious United Kingdom aliases", () => {
    assert.equal(normalizeCountryName("UK"), "United Kingdom");
    assert.equal(normalizeCountryName("U.K."), "United Kingdom");
    assert.equal(normalizeCountryName("Great Britain"), "United Kingdom");
    assert.equal(normalizeCountryName("United Kingdom"), "United Kingdom");
  });

  it("does not normalize unrelated country names", () => {
    assert.equal(normalizeCountryName("France"), "France");
    assert.equal(normalizeCountryName("Georgia"), "Georgia");
  });

  it("normalizes historical country aliases", () => {
    assert.equal(normalizeCountryName("West Germany"), "Germany");
    assert.equal(normalizeCountryName("Czechoslovakia"), "Czech Republic");
  });
});

describe("splitCountries country aliases", () => {
  it("merges USA and United States into one bucket across films", () => {
    const analytics = analyzeFilmCatalog([
      { id: "1", title: "Film A", country: "USA", aesthetic_tags: [], narrative_tags: [] },
      {
        id: "2",
        title: "Film B",
        country: "United States",
        aesthetic_tags: [],
        narrative_tags: [],
      },
      {
        id: "3",
        title: "Film C",
        country: "France",
        aesthetic_tags: [],
        narrative_tags: [],
      },
    ]);

    assert.equal(analytics.countryCoverage.counts["United States"], 2);
    assert.equal(analytics.countryCoverage.counts.USA, undefined);
    assert.equal(analytics.countryCoverage.counts.France, 1);
  });
});

describe("splitCurationRegions", () => {
  it("maps a single-country film to one macro region", () => {
    assert.deepEqual(splitCurationRegions("France"), [WESTERN_EUROPE]);
    assert.deepEqual(splitCurationRegions("Japan"), [JAPAN]);
    assert.deepEqual(splitCurationRegions("United States"), [
      ANGLOPHONE_NORTH_ATLANTIC,
    ]);
  });

  it("uses the first listed country as the primary region for co-productions", () => {
    assert.deepEqual(splitCurationRegions("France, Japan"), [WESTERN_EUROPE]);
    assert.deepEqual(splitCurationRegions("Japan, France"), [JAPAN]);
    assert.deepEqual(splitCurationRegions("France, Belgium"), [WESTERN_EUROPE]);
  });

  it("maps unknown or unmapped primary countries to Other / mixed / unknown", () => {
    assert.deepEqual(splitCurationRegions("Unknown"), [CURATION_REGION_OTHER]);
    assert.deepEqual(splitCurationRegions("Georgia"), [CURATION_REGION_OTHER]);
    assert.deepEqual(splitCurationRegions(null), [CURATION_REGION_OTHER]);
  });

  it("maps macro basins across Europe, Anglophone, Asia, Latin America, and Middle East", () => {
    assert.deepEqual(splitCurationRegions("Germany"), [WESTERN_EUROPE]);
    assert.deepEqual(splitCurationRegions("Czech Republic"), [
      CENTRAL_EASTERN_EUROPE,
    ]);
    assert.deepEqual(splitCurationRegions("United Kingdom"), [BRITISH_ISLES]);
    assert.deepEqual(splitCurationRegions("UK"), [BRITISH_ISLES]);
    assert.deepEqual(splitCurationRegions("Ireland"), [BRITISH_ISLES]);
    assert.deepEqual(splitCurationRegions("Canada"), [ANGLOPHONE_NORTH_ATLANTIC]);
    assert.deepEqual(splitCurationRegions("China"), [ASIA_EXCL_JAPAN]);
    assert.deepEqual(splitCurationRegions("Brazil"), [LATIN_AMERICA]);
    assert.deepEqual(splitCurationRegions("Iran"), [MIDDLE_EAST_TURKEY]);
  });

  it("maps historical country aliases to the expected macro regions", () => {
    assert.deepEqual(splitCurationRegions("West Germany"), [WESTERN_EUROPE]);
    assert.deepEqual(splitCurationRegions("Czechoslovakia"), [
      CENTRAL_EASTERN_EUROPE,
    ]);
    assert.deepEqual(splitCurationRegions("USA"), [ANGLOPHONE_NORTH_ATLANTIC]);
  });

  it("folds Nordic countries into Western Europe", () => {
    assert.deepEqual(splitCurationRegions("Denmark"), [WESTERN_EUROPE]);
    assert.deepEqual(splitCurationRegions("Sweden, Norway"), [WESTERN_EUROPE]);
  });

  it("includes example countries in region labels", () => {
    assert.match(WESTERN_EUROPE, /France/);
    assert.match(CENTRAL_EASTERN_EUROPE, /Czech Republic/);
    assert.match(BRITISH_ISLES, /United Kingdom/);
    assert.match(ANGLOPHONE_NORTH_ATLANTIC, /United States/);
    assert.doesNotMatch(ANGLOPHONE_NORTH_ATLANTIC, /United Kingdom|UK\b/);
    assert.match(ASIA_EXCL_JAPAN, /China/);
    assert.match(LATIN_AMERICA, /Brazil/);
    assert.match(MIDDLE_EAST_TURKEY, /Iran/);
  });
});

describe("analyzeFilmCatalog curation regions", () => {
  it("counts region coverage without changing country coverage", () => {
    const analytics = analyzeFilmCatalog([
      {
        id: "1",
        title: "French Film",
        country: "France",
        aesthetic_tags: [],
        narrative_tags: [],
      },
      {
        id: "2",
        title: "Co-production",
        country: "France, Japan",
        aesthetic_tags: [],
        narrative_tags: [],
      },
      {
        id: "3",
        title: "Unknown origin",
        country: "Unknown",
        aesthetic_tags: [],
        narrative_tags: [],
      },
    ]);

    assert.equal(analytics.countryCoverage.counts.France, 2);
    assert.equal(analytics.countryCoverage.counts.Japan, 1);
    assert.equal(analytics.countryCoverage.uniqueValues, 2);

    assert.equal(analytics.curationRegionCoverage.counts[WESTERN_EUROPE], 2);
    assert.equal(analytics.curationRegionCoverage.counts.Japan, undefined);
    assert.equal(
      analytics.curationRegionCoverage.counts[CURATION_REGION_OTHER],
      1
    );
    assert.equal(analytics.overview.totalFilms, 3);
  });
});

describe("splitTechniques", () => {
  it("splits multi-value techniques and normalizes casing", () => {
    assert.deepEqual(splitTechniques("Stop-motion, 2D"), [
      "stop-motion",
      "2d",
    ]);
  });

  it("deduplicates repeated techniques", () => {
    assert.deepEqual(splitTechniques("2D, 2d"), ["2d"]);
  });
});

describe("getDecadeLabel", () => {
  it("returns decade labels", () => {
    assert.equal(getDecadeLabel(1994), "1990s");
    assert.equal(getDecadeLabel(2024), "2020s");
  });

  it("returns Unknown for missing years", () => {
    assert.equal(getDecadeLabel(null), "Unknown");
  });
});

describe("tag counting", () => {
  it("normalizes and counts tags", () => {
    assert.equal(countTags([" dreamy ", "", "dreamy", "unknown"]), 1);
    assert.deepEqual(normalizeTagList(["A", "unknown", "B"]), ["A", "B"]);
  });

  it("summarizes top, rare, and very frequent tags", () => {
    const summary = summarizeTagCounts({
      common: 10,
      medium: 3,
      rare: 1,
    });

    assert.equal(summary.top[0].tag, "common");
    assert.ok(summary.rare.some((entry) => entry.tag === "rare"));
    assert.ok(summary.veryFrequent.some((entry) => entry.tag === "common"));
  });
});

describe("metadata health", () => {
  it("detects missing metadata and suspicious placeholders", () => {
    const films = [
      {
        id: "1",
        title: "Complete Film",
        year: 2020,
        country: "France",
        duration_minutes: 10,
        technique: "2D",
        festival: "Annecy",
        poster_url: "https://example.com/poster.jpg",
        moods: ["calm"],
        aesthetic_tags: ["minimal"],
        narrative_tags: ["friendship"],
      },
      {
        id: "2",
        title: "TODO",
        year: null,
        country: "Unknown",
        duration_minutes: null,
        technique: null,
        festival: null,
        moods: [],
        aesthetic_tags: [],
        narrative_tags: [],
      },
    ];

    const health = analyzeMetadataHealth(films);

    assert.equal(health.missingPoster.length, 1);
    assert.equal(health.missingDuration.length, 1);
    assert.equal(health.missingTechnique.length, 1);
    assert.equal(health.missingFestival.length, 1);
    assert.equal(health.tooFewTags.length, 1);
    assert.equal(health.suspiciousValues.length, 1);
    assert.equal(hasPoster(films[0]), true);
    assert.equal(isEmptyOrUnknownValue("unknown"), true);
    assert.equal(isSuspiciousPlaceholderValue("TODO"), true);
  });
});

describe("duplicate normalization", () => {
  it("finds normalized title and title+year duplicate groups", () => {
    const films = [
      {
        id: "1",
        title: "Mary & Max",
        original_title: null,
        year: 2009,
        director: "Adam Elliot",
      },
      {
        id: "2",
        title: "Mary and Max",
        original_title: null,
        year: 2009,
        director: "Adam Elliot",
      },
      {
        id: "3",
        title: "The Red Turtle",
        original_title: "La Tortue Rouge",
        year: 2016,
        director: "Michael Dudok de Wit",
      },
    ];

    const duplicates = findPotentialDuplicateGroups(films);

    assert.equal(
      normalizeFilmString("Mary & Max"),
      normalizeFilmString("Mary and Max")
    );
    assert.ok(duplicates.normalizedTitleDuplicates.length >= 1);
    assert.ok(duplicates.titleYearDuplicates.length >= 1);
  });
});

describe("analyzeFilmCatalog", () => {
  it("returns deterministic overview metrics", () => {
    const analytics = analyzeFilmCatalog([
      {
        id: "1",
        title: "Film A",
        year: 2018,
        country: "France, Belgium",
        duration_minutes: 12,
        technique: "2D",
        festival: "Annecy",
        source_url: "https://www.example.com/film-a",
        poster_url: "https://example.com/a.jpg",
        moods: ["calm", "hopeful"],
        aesthetic_tags: ["minimal"],
        narrative_tags: ["friendship"],
      },
      {
        id: "2",
        title: "Film B",
        year: 2022,
        country: "Canada",
        duration_minutes: null,
        technique: "Stop-motion",
        festival: null,
        source_url: null,
        moods: ["dark"],
        aesthetic_tags: [],
        narrative_tags: [],
      },
    ]);

    assert.equal(analytics.overview.totalFilms, 2);
    assert.equal(analytics.overview.withPoster, 1);
    assert.equal(analytics.overview.withoutDuration, 1);
    assert.equal(analytics.countryCoverage.top.length, 3);
    assert.equal(analytics.decadeCoverage.from2020Onward, 1);
    assert.ok(analytics.curationSuggestions.items.length > 0);
    assert.equal(analytics.festivalCoverage.available, true);
    assert.equal(analytics.sourceCoverage.available, true);
  });
});
