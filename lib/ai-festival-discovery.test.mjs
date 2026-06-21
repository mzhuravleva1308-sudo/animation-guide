import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAiFestivalDiscoveryPrompt,
  parseAiDiscoveryCandidates,
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
    assert.match(prompt, /possiblyAtFestival/);
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
  it("collapses legacy recognitions array to one possible claim", () => {
    const candidates = parseAiDiscoveryCandidates(
      {
        recognitions: [
          {
            festivalName: "Annecy International Animation Film Festival",
            festivalYear: 1995,
            section: "Feature Films",
            recognitionType: "award",
            awardName: "Grand Prix",
            originalText: "Won Grand Prix at Annecy 1995.",
            confidence: "high",
          },
        ],
      },
      { filmTitle: "Pom Poko", festivalFilterId: "annecy" }
    );

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].source_type, "ai_inference");
    assert.equal(candidates[0].recognition_type, RECOGNITION_TYPE_POSSIBLE);
    assert.equal(candidates[0].award_name, null);
  });

  it("skips low-confidence and non-festival names", () => {
    const candidates = parseAiDiscoveryCandidates({
      recognitions: [
        {
          festivalName: "Academy Awards",
          festivalYear: 1995,
          recognitionType: "award",
          originalText: "Oscar nominee",
          confidence: "high",
        },
        {
          festivalName: "Annecy International Animation Film Festival",
          festivalYear: 2020,
          recognitionType: "screening",
          originalText: "Maybe screened",
          confidence: "low",
        },
      ],
    });

    assert.equal(candidates.length, 0);
  });
});
