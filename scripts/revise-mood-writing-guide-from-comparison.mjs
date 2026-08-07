#!/usr/bin/env node
/**
 * Application-driven self-review of the Mood Writing Guide.
 * Uses comparison evidence; writes revised guide as v2. No films writes.
 *
 *   APP_ENV=hosted node scripts/revise-mood-writing-guide-from-comparison.mjs \
 *     --comparison tmp/mood-only-comparison-50.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { applyAppEnv } from "./load-app-env.mjs";
import { parseJsonFromModelText } from "../lib/film-discovery-workflow.mjs";
import {
  loadMoodWritingGuide,
  MOOD_GUIDE_ACTIVE_PATH,
  MOOD_GUIDE_REPORTS_DIR,
  saveMoodWritingGuideArtifact,
} from "../lib/film-mood-writing-guide.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISED_VERSION = "resonale-mood-writing-guide-v2";

function parseArgs(argv) {
  const options = {
    comparison: path.join(ROOT, "tmp/mood-only-comparison-50.json"),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--comparison") options.comparison = argv[++i];
    else if (arg.startsWith("--comparison=")) {
      options.comparison = arg.slice("--comparison=".length);
    } else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function loadJsonLoose(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    return JSON.parse(raw.slice(start, end + 1));
  }
}

function buildEvidencePack(comparison) {
  const results = comparison.results ?? [];
  const openings = {};
  const adjPairRe = /^[A-Za-z]+\s+and\s+[A-Za-z]+/;
  let adjPair = 0;
  const samples = results.map((row) => {
    const mood = row.new_the_mood ?? "";
    const open = String(mood).trim().toLowerCase().split(/\s+/).slice(0, 2).join(" ");
    openings[open] = (openings[open] ?? 0) + 1;
    if (adjPairRe.test(mood)) adjPair += 1;
    return {
      title: row.title,
      previous_the_mood: row.previous_the_mood,
      new_the_mood: row.new_the_mood,
      unchanged: row.unchanged,
      principles_applied: row.principles_applied,
      reviewer_verdict: row.reviewer_verdict,
    };
  });

  return {
    metrics: comparison.metrics,
    adjective_pair_opening_count: adjPair,
    opening_histogram: Object.entries(openings)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([opening, count]) => ({ opening, count })),
    human_feedback: {
      improved: [
        "reviewer PASS high",
        "with a … rhythm reduced to 0",
        "near-duplicate structures reduced to 0",
        "generic wording slightly down",
      ],
      worsened: [
        "repeated opening groups up",
        "interchangeable mood flags up",
        "new dominant Adj+Adj openings (Bleak and / Intimate and / Chaotic and / …)",
        "some lines feel ornamental / AI-poetic rather than plain editorial",
      ],
      ornamental_examples: [
        "flickering with sparks of hope amid frozen desolation",
        "suburban reveries and quiet hopes",
        "social shadows and secret desires",
        "tender contradictions",
        "melancholic embrace",
      ],
    },
    sample_rewrites: samples.filter((row) =>
      [
        "Blood Tea and Red String",
        "Fire and Ice",
        "Boys Go to Jupiter",
        "Tehran Taboo",
        "The Weird Kidz",
        "Bubble Bath",
        "Rio 2096: A Story of Love and Fury",
        "Black Butterflies",
        "Padak",
      ].includes(row.title)
    ),
    // Include a random slice of new moods so analyst sees batch texture
    new_moods_batch: samples.map((row) => ({
      title: row.title,
      the_mood: row.new_the_mood,
    })),
  };
}

function buildRevisionPrompt(currentGuide, evidence) {
  return `
You are the Resonale Mood Analyst reviewing YOUR OWN Mood Writing Guide after it was applied to a 50-film batch.

Do NOT invent a new architecture. Do a MINIMAL revision of the guide so future writers produce:
- specific, natural, concise, film-specific, varied, editorial language
NOT:
- a new stock Adj+Adj opening formula across the batch
- ornamental / AI-poetic phrasing that sounds literary but interchangeable

Current guide:
${JSON.stringify(currentGuide.final_guide ?? currentGuide, null, 2)}

Application evidence:
${JSON.stringify(evidence, null, 2)}

Diagnose yourself:
1. Which principles / strong patterns / syntax library entries / good examples taught Adj+Adj as the default opening?
2. Which elements encouraged ornamental packing of many mood dimensions into one line?
3. Where does "avoid formulaic repetition" contradict the examples or syntax library?
4. Does the guide push writers to include too many dimensions per sentence?

Then revise minimally. Rules for revision:
- Keep Purpose, specificity test, synopsis relationship, moods-tags relationship in spirit.
- Do NOT add hard quotas, ban-lists of openings, or fill-in templates.
- Prefer reframing: adjective-pair openings are ONE optional tool, not the house default.
- Prefer plain editorial concreteness over poetic flourish.
- Rebalance good_examples toward natural syntax variety (not mostly Adj and Adj…).
- Keep 12–20 good_examples and 8–12 anti_examples; quote corpus texts when possible; you may demote former "good" examples that teach the bad default into anti_examples or drop them.
- Version must be "${REVISED_VERSION}".

Return ONLY JSON:
{
  "diagnosis": {
    "adj_pair_causes": ["..."],
    "ornamental_causes": ["..."],
    "internal_contradictions": ["..."],
    "dimension_overload": "..."
  },
  "changes": {
    "keep": ["..."],
    "weaken": ["..."],
    "remove": ["..."],
    "reframe": ["..."],
    "examples_removed_or_demoted": [{"title":"...","the_mood":"...","why":"..."}],
    "examples_added_or_kept": [{"title":"...","the_mood":"...","why":"..."}],
    "missing_principles_added": ["..."]
  },
  "self_review_summary": "one short paragraph",
  "revised_guide": {
    "version": "${REVISED_VERSION}",
    "sections": { /* same section shape as current guide */ },
    "analyst_notes": "..."
  }
}
`.trim();
}

async function main() {
  applyAppEnv();
  const options = parseArgs(process.argv.slice(2));
  const current = loadMoodWritingGuide();
  if (!current) throw new Error("Active Mood Writing Guide missing");
  const comparison = loadJsonLoose(options.comparison);
  const evidence = buildEvidencePack(comparison);

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY required");
  const openai = new OpenAI({ apiKey: openaiKey });

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are Resonale Mood Analyst doing application-driven self-review. Return JSON only. Minimal revision; no hard quotas.",
      },
      { role: "user", content: buildRevisionPrompt(current, evidence) },
    ],
  });

  const review = parseJsonFromModelText(response.choices?.[0]?.message?.content);
  const revisedGuide = review.revised_guide;
  if (!revisedGuide?.sections) {
    throw new Error("Analyst did not return revised_guide.sections");
  }

  const artifact = {
    version: REVISED_VERSION,
    generated_at: new Date().toISOString(),
    model: "gpt-4.1",
    corpus_size: current.corpus_size ?? null,
    excluded_record_count: current.excluded_record_count ?? null,
    parent_version: current.version ?? "resonale-mood-writing-guide-v1",
    application_review: {
      source_comparison: options.comparison,
      diagnosis: review.diagnosis ?? null,
      changes: review.changes ?? null,
      self_review_summary: review.self_review_summary ?? null,
      evidence_metrics: evidence.metrics,
      adjective_pair_opening_count: evidence.adjective_pair_opening_count,
      opening_histogram: evidence.opening_histogram,
    },
    initial_guide: current.final_guide ?? current,
    self_review: {
      verdict: "REVISE",
      summary: review.self_review_summary ?? null,
      issues: review.diagnosis?.internal_contradictions ?? [],
    },
    final_guide: revisedGuide,
  };

  const reportPath = path.join(
    MOOD_GUIDE_REPORTS_DIR,
    `${REVISED_VERSION}-application-review.json`
  );
  fs.mkdirSync(MOOD_GUIDE_REPORTS_DIR, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(artifact, null, 2));

  if (!options.dryRun) {
    saveMoodWritingGuideArtifact(artifact, { writeActive: true, dryRun: false });
  }

  // Compact diff of principles / syntax / example titles
  const before = (current.final_guide ?? current).sections ?? current.final_guide;
  const after = revisedGuide.sections;
  const beforeGoods = new Set((before.good_examples ?? []).map((e) => e.title));
  const afterGoods = new Set((after.good_examples ?? []).map((e) => e.title));
  const kept = [...afterGoods].filter((t) => beforeGoods.has(t));
  const removed = [...beforeGoods].filter((t) => !afterGoods.has(t));
  const added = [...afterGoods].filter((t) => !beforeGoods.has(t));

  console.log(
    JSON.stringify(
      {
        phase: options.dryRun ? "preview" : "saved",
        version: REVISED_VERSION,
        activePath: options.dryRun ? null : MOOD_GUIDE_ACTIVE_PATH,
        reportPath,
        diagnosis: review.diagnosis,
        changes: review.changes,
        self_review_summary: review.self_review_summary,
        example_diff: { kept, removed, added },
        principle_count_before: before.core_principles?.length,
        principle_count_after: after.core_principles?.length,
        good_before: before.good_examples?.length,
        good_after: after.good_examples?.length,
        writes_to_films_table: false,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
