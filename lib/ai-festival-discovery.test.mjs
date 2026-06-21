import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAiFestivalDiscoveryPrompt,
  parseAiDiscoveryCandidates,
  parseAiFestivalsList,
  parseAiPossibleParticipation,
} from "./ai-festival-discovery.mjs";
import { RECOGNITION_TYPE_POSSIBLE } from "./film-festival-claim.mjs";

describe("buildAiFestivalDiscoveryPrompt", () => {
  it("includes film metadata and optional festival scope", () => {
    const prompt = buildAiFestivalDiscoveryPrompt(
      {
        title: "Pom Poko",
        original_title: "平成狸合戦ぽんぽこ",
        year: 1994,
        director: "Isao Takahata",
        festival: "Annecy",
        section: null,
      },
      { festivalFilterId: "annecy" }
    );

    assert.match(prompt, /Pom Poko/);
    assert.match(prompt, /annecy/i);
    assert.match(prompt, /"festivals"/);
  });

  it("mentions major general festivals in the default scope", () => {
    const prompt = buildAiFestivalDiscoveryPrompt({
      title: "Persepolis",
      year: 2007,
      director: "Marjane Satrapi",
    });

    assert.match(prompt, /Cannes Film Festival/);
    assert.match(prompt, /Berlin/);
  });
});

describe("parseAiFestivalsList", () => {
  it("returns multiple festival claims for one film", () => {
    const candidates = parseAiFestivalsList(
      {
        festivals: [
          {
            festivalName: "Cannes Film Festival",
            festivalYear: 2007,
            confidence: "high",
            reason: "Premiered In Competition at Cannes 2007.",
          },
          {
            festivalName: "Annecy International Animation Film Festival",
            festivalYear: 2007,
            confidence: "medium",
            reason: "Later screened at Annecy.",
          },
        ],
      },
      { filmTitle: "Persepolis" }
    );

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].recognition_type, RECOGNITION_TYPE_POSSIBLE);
    assert.match(candidates[0].festival_name, /Cannes/i);
  });
});

describe("parseAiPossibleParticipation", () => {
  it("creates a coarse possible-participation claim", () => {
    const candidates = parseAiPossibleParticipation(
      {
        possiblyAtFestival: true,
        festivalName: "Annecy International Animated Film Festival",
        festivalYear: 2012,
        confidence: "medium",
        reason: "Known Annecy award winner from public sources.",
      },
      { filmTitle: "Approved for Adoption", festivalFilterId: "annecy" }
    );

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].recognition_type, RECOGNITION_TYPE_POSSIBLE);
    assert.equal(candidates[0].award_name, null);
    assert.equal(candidates[0].festival_year, 2012);
  });
});

describe("parseAiDiscoveryCandidates", () => {
  it("prefers festivals array over legacy single-boolean format", () => {
    const candidates = parseAiDiscoveryCandidates(
      {
        festivals: [
          {
            festivalName: "Cannes Film Festival",
            festivalYear: 2007,
            confidence: "high",
            reason: "Premiered at Cannes.",
          },
        ],
        possiblyAtFestival: false,
      },
      { filmTitle: "Persepolis" }
    );

    assert.equal(candidates.length, 1);
    assert.match(candidates[0].festival_name, /Cannes/i);
  });

  it("returns all legacy recognitions instead of collapsing to one", () => {
    const candidates = parseAiDiscoveryCandidates(
      {
        recognitions: [
          {
            festivalName: "Cannes Film Festival",
            festivalYear: 2007,
            recognitionType: "official_selection",
            originalText: "In Competition at Cannes 2007.",
            confidence: "high",
          },
          {
            festivalName: "Annecy International Animation Film Festival",
            festivalYear: 2008,
            recognitionType: "screening",
            originalText: "Screened at Annecy.",
            confidence: "high",
          },
        ],
      },
      { filmTitle: "Persepolis" }
    );

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].source_type, "ai_inference");
    assert.equal(candidates[0].recognition_type, RECOGNITION_TYPE_POSSIBLE);
    assert.equal(candidates[0].award_name, null);
  });

  it("skips low-confidence and non-festival names", () => {
    const candidates = parseAiDiscoveryCandidates({
      festivals: [
        {
          festivalName: "Academy Awards",
          festivalYear: 2008,
          confidence: "high",
          reason: "Oscar nominee",
        },
        {
          festivalName: "Annecy International Animation Film Festival",
          festivalYear: 2020,
          confidence: "low",
          reason: "Maybe screened",
        },
      ],
    });

    assert.equal(candidates.length, 0);
  });
});
