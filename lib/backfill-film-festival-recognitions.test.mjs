import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifySourceUrl,
  EVIDENCE_STATUSES,
  resolveEvidenceStatus,
  shouldImportCandidate,
} from "./festival-evidence-quality.mjs";
import {
  buildFilmFestivalEvidence,
  extractLegacyCatalogCandidates,
  filterCandidatesByFestivalId,
  isCandidateForFestival,
  isFilmInFestivalScope,
  markOutOfScopeFestivalCandidate,
  partitionCandidatesByFestivalScope,
} from "./backfill-film-festival-recognitions.mjs";
import { isConfiguredFestival } from "./festival-official-sources.mjs";
import { getFestivalRecognitionSignalWeight as getSignalWeight } from "./film-festival-recognition.mjs";

describe("extractLegacyCatalogCandidates", () => {
  it("skips bare legacy festival fields without explicit evidence", () => {
    const candidates = extractLegacyCatalogCandidates({
      id: "1",
      title: "Arco",
      year: 2025,
      festival: "Cannes Film Festival",
      section: null,
      source_url: null,
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].evidence_status, EVIDENCE_STATUSES.SKIPPED);
    assert.equal(candidates[0].importable, false);
  });

  it("accepts explicit winner wording as reliable secondary catalog evidence", () => {
    const candidates = extractLegacyCatalogCandidates({
      id: "2",
      title: "Example",
      year: 2023,
      festival: "Annecy International Animation Film Festival",
      section: "Winner — Crystal for Best Short Film",
      source_url: null,
    });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].recognition_type, "winner");
    assert.equal(
      candidates[0].evidence_status,
      EVIDENCE_STATUSES.CONFIRMED_SECONDARY
    );
    assert.equal(shouldImportCandidate(candidates[0]), false);
  });

  it("treats explicit premiere catalog wording as blocked until official verification", () => {
    const candidates = extractLegacyCatalogCandidates({
      id: "3",
      title: "Example",
      year: 2014,
      festival: "BFI London Film Festival",
      section: "World premiere at BFI London Film Festival",
      source_url: null,
    });

    assert.equal(candidates[0].recognition_type, "screening");
    assert.equal(
      candidates[0].evidence_status,
      EVIDENCE_STATUSES.CONFIRMED_SECONDARY
    );
    assert.equal(shouldImportCandidate(candidates[0]), false);
  });
});

describe("configured festival scope gate", () => {
  it("recognizes the 10 configured festivals via isConfiguredFestival", () => {
    assert.equal(isConfiguredFestival("Annecy International Animated Film Festival"), true);
    assert.equal(isConfiguredFestival("Berlin International Film Festival"), true);
    assert.equal(isConfiguredFestival("Pingyao International Film Festival"), false);
    assert.equal(isConfiguredFestival("New York International Children's Film Festival"), false);
  });

  it("partitions candidates into in-scope and out-of-scope buckets", () => {
    const { inScope, outOfScope } = partitionCandidatesByFestivalScope([
      {
        festival_name: "Berlin International Film Festival",
        festival_year: 2017,
        recognition_type: "official_selection",
      },
      {
        festival_name: "Pingyao International Film Festival",
        festival_year: 2017,
        recognition_type: "screening",
      },
    ]);

    assert.equal(inScope.length, 1);
    assert.equal(outOfScope.length, 1);
    assert.equal(
      outOfScope[0].evidence_status,
      EVIDENCE_STATUSES.SKIPPED_OUT_OF_SCOPE
    );
    assert.equal(outOfScope[0].importable, false);
  });

  it("keeps in-scope legacy evidence and drops non-configured festivals", () => {
    const evidence = buildFilmFestivalEvidence(
      {
        title: "Have a Nice Day",
        year: 2017,
        festival: "Berlin International Film Festival",
        section: null,
        source_url: null,
      },
      {
        title: "Have a Nice Day (film)",
        url: "https://en.wikipedia.org/wiki/Have_a_Nice_Day_(film)",
        extract:
          "It premiered in the main competition for the Golden Bear at the 67th Berlin International Film Festival in February 2017. In China, the premiere of the film took place at the Pingyao International Film Festival in early November 2017.",
      },
      [
        {
          festival_name: "Berlin International Film Festival",
          festival_year: 2017,
          section: "main competition",
          recognition_type: "official_selection",
          original_text:
            "It premiered in the main competition for the Golden Bear at the 67th Berlin International Film Festival in February 2017.",
          source_type: "wikipedia",
        },
        {
          festival_name: "Pingyao International Film Festival",
          festival_year: 2017,
          recognition_type: "screening",
          original_text:
            "In China, the premiere of the film took place at the Pingyao International Film Festival in early November 2017.",
          source_type: "wikipedia",
        },
      ]
    );

    assert.equal(evidence.allCandidates.length, 2);
    assert.equal(
      evidence.allCandidates.every((candidate) =>
        isConfiguredFestival(candidate.festival_name)
      ),
      true
    );
    assert.equal(evidence.outOfScopeSkipped.length, 1);
    assert.equal(
      evidence.outOfScopeSkipped[0].festival_name,
      "Pingyao International Film Festival"
    );
    assert.equal(
      evidence.outOfScopeSkipped[0].evidence_status,
      EVIDENCE_STATUSES.SKIPPED_OUT_OF_SCOPE
    );
    assert.doesNotMatch(
      evidence.allCandidates.map((candidate) => candidate.festival_name).join("|"),
      /Pingyao/
    );
  });

  it("returns no in-scope candidates when only non-configured festivals are present", () => {
    const evidence = buildFilmFestivalEvidence(
      {
        title: "Example",
        year: 2020,
        festival: "Pingyao International Film Festival",
        section: "World premiere",
        source_url: null,
      },
      null,
      []
    );

    assert.equal(evidence.allCandidates.length, 0);
    assert.equal(evidence.outOfScopeSkipped.length, 1);
    assert.equal(
      markOutOfScopeFestivalCandidate({
        festival_name: "Pingyao International Film Festival",
      }).evidence_status,
      EVIDENCE_STATUSES.SKIPPED_OUT_OF_SCOPE
    );
  });
});

describe("festival filter scope", () => {
  it("isFilmInFestivalScope detects Annecy via legacy catalog field", () => {
    assert.equal(
      isFilmInFestivalScope("annecy", {
        film: {
          festival: "Annecy International Animation Film Festival",
        },
        legacyCandidates: [],
        wikipediaCandidates: [],
      }),
      true
    );
  });

  it("isFilmInFestivalScope detects Annecy via Wikipedia extraction candidates", () => {
    assert.equal(
      isFilmInFestivalScope("annecy", {
        film: { festival: null },
        legacyCandidates: [],
        wikipediaCandidates: [
          {
            festival_name: "Annecy International Animated Film Festival",
            festival_year: 1995,
            recognition_type: "winner",
          },
        ],
      }),
      true
    );
  });

  it("isFilmInFestivalScope returns false when only other festivals are present", () => {
    assert.equal(
      isFilmInFestivalScope("annecy", {
        film: { festival: "Cannes Film Festival" },
        legacyCandidates: extractLegacyCatalogCandidates({
          id: "1",
          title: "Arco",
          year: 2025,
          festival: "Cannes Film Festival",
          section: null,
          source_url: null,
        }),
        wikipediaCandidates: [
          {
            festival_name: "Berlin International Film Festival",
            festival_year: 2017,
            recognition_type: "official_selection",
          },
        ],
      }),
      false
    );
  });

  it("filterCandidatesByFestivalId keeps only Annecy and marks other configured festivals skipped", () => {
    const { matched, filteredOut } = filterCandidatesByFestivalId(
      [
        {
          festival_name: "Annecy International Animation Film Festival",
          festival_year: 1995,
          recognition_type: "winner",
        },
        {
          festival_name: "Cannes Film Festival",
          festival_year: 2023,
          recognition_type: "official_selection",
        },
        {
          festival_name: "Pingyao International Film Festival",
          festival_year: 2017,
          recognition_type: "screening",
        },
      ],
      "annecy"
    );

    assert.equal(matched.length, 1);
    assert.equal(matched[0].festival_name, "Annecy International Animation Film Festival");
    assert.equal(filteredOut.length, 2);
    assert.equal(
      filteredOut.find((row) => row.festival_name === "Cannes Film Festival")
        ?.evidence_status,
      EVIDENCE_STATUSES.SKIPPED
    );
    assert.equal(
      filteredOut.find((row) => row.festival_name === "Pingyao International Film Festival")
        ?.evidence_status,
      EVIDENCE_STATUSES.SKIPPED_OUT_OF_SCOPE
    );
  });

  it("buildFilmFestivalEvidence with festivalFilterId keeps only Annecy candidates", () => {
    const evidence = buildFilmFestivalEvidence(
      {
        title: "Mars Express",
        year: 2023,
        festival: "Cannes Film Festival",
        section: null,
        source_url: null,
      },
      {
        title: "Mars Express (film)",
        url: "https://en.wikipedia.org/wiki/Mars_Express_(film)",
        extract:
          "It premiered at Cannes in 2023 and was selected for Annecy International Animation Film Festival 2023.",
      },
      [
        {
          festival_name: "Cannes Film Festival",
          festival_year: 2023,
          recognition_type: "official_selection",
          original_text: "It premiered at Cannes in 2023",
          source_type: "wikipedia",
        },
        {
          festival_name: "Annecy International Animation Film Festival",
          festival_year: 2023,
          recognition_type: "official_selection",
          original_text:
            "selected for Annecy International Animation Film Festival 2023",
          source_type: "wikipedia",
        },
      ],
      { festivalFilterId: "annecy" }
    );

    assert.equal(evidence.allCandidates.length, 1);
    assert.equal(isCandidateForFestival(evidence.allCandidates[0], "annecy"), true);
    assert.equal(evidence.festivalFilterSkipped.length, 2);
    assert.equal(
      evidence.festivalFilterSkipped.filter(
        (row) => row.festival_name === "Cannes Film Festival"
      ).length,
      2
    );
  });
});

describe("Wikipedia evidence rules", () => {
  it("keeps wikipedia-only strong recognitions in review queue", () => {
    const evidence = buildFilmFestivalEvidence(
      {
        title: "The Illusionist",
        year: 2010,
        festival: null,
        section: null,
      },
      {
        title: "The Illusionist (2010 film)",
        url: "https://en.wikipedia.org/wiki/The_Illusionist_(2010_film)",
        extract:
          "The film premiered at the Berlinale festival in February 2010.",
      },
      [
        {
          festival_name: "Berlin International Film Festival",
          festival_year: 2010,
          recognition_type: "official_selection",
          original_text: "The film premiered at the Berlinale festival in February 2010.",
          source_type: "wikipedia",
        },
      ]
    );

    assert.equal(evidence.importable.length, 0);
    assert.equal(
      evidence.allCandidates[0]?.evidence_status,
      EVIDENCE_STATUSES.NEEDS_REVIEW
    );
  });

  it("promotes wikipedia candidates with official URLs in the article", () => {
    const evidence = buildFilmFestivalEvidence(
      {
        title: "Example",
        year: 2024,
        festival: null,
        section: null,
      },
      {
        title: "Example film",
        url: "https://en.wikipedia.org/wiki/Example",
        extract:
          "It won the Crystal at Annecy. Official page: https://www.annecy.org/festival/awards",
      },
      [
        {
          festival_name: "Annecy International Animated Film Festival",
          festival_year: 2024,
          recognition_type: "winner",
          award_name: "Crystal for Best Short Film",
          original_text: "It won the Crystal at Annecy.",
          source_type: "wikipedia",
        },
      ]
    );

    assert.equal(evidence.importable.length, 1);
    assert.equal(
      evidence.importableCandidates[0]?.evidence_status,
      EVIDENCE_STATUSES.CONFIRMED_OFFICIAL
    );
    assert.match(
      String(evidence.importableCandidates[0]?.source_url),
      /annecy\.org/
    );
  });
});

describe("classifySourceUrl", () => {
  it("recognizes official festival domains", () => {
    assert.equal(
      classifySourceUrl("https://www.annecy.org/festival/awards").tier,
      "official"
    );
    assert.equal(
      classifySourceUrl("https://en.wikipedia.org/wiki/Example").tier,
      "wikipedia"
    );
  });
});

describe("screening recommendation weight", () => {
  it("does not contribute recommendation signal", () => {
    assert.equal(
      getSignalWeight({ recognition_type: "screening", award_level: null }),
      0
    );
  });
});

describe("resolveEvidenceStatus", () => {
  it("marks wikipedia-only evidence as needs review", () => {
    const result = resolveEvidenceStatus(
      { recognition_type: "official_selection" },
      { wikipediaOnly: true, explicitText: "premiered at Cannes" }
    );

    assert.equal(result.evidence_status, EVIDENCE_STATUSES.NEEDS_REVIEW);
    assert.equal(result.importable, false);
  });
});
