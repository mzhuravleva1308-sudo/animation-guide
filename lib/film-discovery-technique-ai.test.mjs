import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTechniqueAiPrompt,
  inferTechniqueViaAi,
  normalizeTechniqueAiResponse,
  techniqueAiResponseToEvidence,
} from "./film-discovery-technique-ai.mjs";
import { gatherTechniqueResearch } from "./film-discovery-content-research.mjs";
import { preferEvidenceBackedTechniqueLabels } from "./film-discovery-technique.mjs";

test("normalizeTechniqueAiResponse accepts catalog label at medium confidence", () => {
  const normalized = normalizeTechniqueAiResponse({
    technique: "hand-drawn animation",
    confidence: "medium",
    abstain: false,
    rationale: "Plympton adult indie features are typically hand-drawn.",
  });
  assert.equal(normalized.accepted, true);
  assert.equal(normalized.technique, "hand-drawn animation");
  const evidence = techniqueAiResponseToEvidence(normalized);
  assert.equal(evidence[0].tier, "ai");
  assert.equal(
    preferEvidenceBackedTechniqueLabels([], evidence)[0],
    "hand-drawn animation"
  );
});

test("normalizeTechniqueAiResponse accepts low confidence catalog labels", () => {
  const normalized = normalizeTechniqueAiResponse({
    technique: "2D animation",
    confidence: "low",
    abstain: false,
    rationale: "Conventional adult animated feature without distinctive method.",
  });
  assert.equal(normalized.accepted, true);
  assert.equal(normalized.technique, "2D animation");
});

test("normalizeTechniqueAiResponse rejects unknown labels and explicit abstain", () => {
  assert.equal(
    normalizeTechniqueAiResponse({
      technique: "unicorn hologram animation",
      confidence: "high",
      abstain: false,
    }).accepted,
    false
  );
  assert.equal(
    normalizeTechniqueAiResponse({
      technique: null,
      confidence: "high",
      abstain: true,
    }).accepted,
    false
  );
});

test("buildTechniqueAiPrompt lists allowlisted labels", () => {
  const prompt = buildTechniqueAiPrompt(
    { title: "Cheatin'", year: 2013, directors: ["Bill Plympton"] },
    { tmdbOverview: "An adult animated feature." }
  );
  assert.match(prompt.user, /Cheatin'/);
  assert.match(prompt.user, /hand-drawn animation/);
  assert.match(prompt.system, /abstain/);
});

test("gatherTechniqueResearch calls AI only when research is empty", async () => {
  let aiCalls = 0;
  const aiTechniqueFn = async () => {
    aiCalls += 1;
    return {
      technique: "rotoscope",
      confidence: "high",
      abstain: false,
      rationale: "Known Bakshi rotoscope-era adult feature.",
    };
  };

  const empty = await gatherTechniqueResearch(
    {
      title: "Heavy Metal",
      year: 1981,
      directors: ["Gerald Potterton"],
      source_urls: [],
    },
    {
      enableSourceFetch: false,
      enableWikipedia: false,
      enableWebSearch: false,
      enableAiTechnique: true,
      aiTechniqueFn,
      tmdbOverview: "An anthology of adult animated stories.",
    }
  );
  assert.equal(aiCalls, 1);
  assert.equal(empty.usedAiTechnique, true);
  assert.ok(empty.techniqueEvidence.some((row) => row.label === "rotoscope"));
  assert.ok(
    empty.researchNotes.some((n) => /ai_technique_accepted:rotoscope/i.test(n))
  );

  aiCalls = 0;
  const withEvidence = await gatherTechniqueResearch(
    {
      title: "Blood Tea and Red String",
      year: 2006,
      directors: ["Christiane Cegavske"],
      source_urls: ["https://annecy.org/films/puppet-film"],
    },
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        text: async () =>
          `<html><body>${"x".repeat(200)}This film was created using stop-motion animation.</body></html>`,
      }),
      enableSourceFetch: true,
      enableWikipedia: false,
      enableWebSearch: false,
      enableAiTechnique: true,
      aiTechniqueFn,
    }
  );
  assert.equal(aiCalls, 0);
  assert.ok(
    withEvidence.researchNotes.includes("ai_technique_skipped_have_evidence")
  );
});

test("inferTechniqueViaAi surfaces unavailable when no llm", async () => {
  const result = await inferTechniqueViaAi(
    { title: "X", year: 2000, directors: ["D"] },
    {},
    { enabled: true }
  );
  assert.deepEqual(result.evidence, []);
  assert.ok(result.researchNotes.includes("ai_technique_unavailable"));
});
