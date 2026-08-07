/**
 * Resonale Mood Writing Guide loader / formatter.
 * Active guide lives under lib/editorial/; full generation artifacts under reports/.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MOOD_GUIDE_ID = "resonale-mood-writing-guide-v1";
export const MOOD_GUIDE_ACTIVE_PATH = path.join(
  ROOT,
  "lib/editorial/resonale-mood-writing-guide.json"
);
export const MOOD_GUIDE_REPORTS_DIR = path.join(ROOT, "reports/mood-writing-guide");

/**
 * @param {string} [filePath]
 */
export function loadMoodWritingGuide(filePath = MOOD_GUIDE_ACTIVE_PATH) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Compact prompt block for Content writer / reviewer.
 * @param {object | null} guide
 */
export function formatMoodWritingGuideForPrompt(guide) {
  if (!guide?.final_guide && !guide?.sections) {
    return "(Mood Writing Guide not loaded — use Content Style Guide mood rules.)";
  }
  const g = guide.final_guide ?? guide;
  const sections = g.sections ?? g;
  const lines = [
    `Resonale Mood Writing Guide version: ${guide.version ?? g.version ?? MOOD_GUIDE_ID}`,
    "",
    "PURPOSE:",
    sections.purpose ?? g.purpose ?? "",
    "",
    "CORE PRINCIPLES:",
    ...(sections.core_principles ?? g.core_principles ?? []).map((p) => `- ${p}`),
    "",
    "MOOD DIMENSIONS (use what fits; not all required):",
    ...(sections.mood_dimensions ?? g.mood_dimensions ?? []).map((d) =>
      typeof d === "string" ? `- ${d}` : `- ${d.name}: ${d.detail ?? ""}`
    ),
    "",
    "STRONG PATTERNS:",
    ...(sections.strong_patterns ?? g.strong_patterns ?? []).map((p) =>
      typeof p === "string" ? `- ${p}` : `- ${p.principle}: ${p.why ?? ""}`
    ),
    "",
    "WEAK PATTERNS (avoid unless truly earned):",
    ...(sections.weak_patterns ?? g.weak_patterns ?? []).map((p) =>
      typeof p === "string" ? `- ${p}` : `- ${p.pattern}: ${p.when_weak ?? p.why ?? ""}`
    ),
    "",
    "SYNTAX VARIETY (principles, not fill-in templates):",
    ...(sections.syntax_library ?? g.syntax_library ?? []).map((p) =>
      typeof p === "string" ? `- ${p}` : `- ${p.type}: ${p.principle ?? ""}`
    ),
    "",
    "SPECIFICITY TEST:",
    sections.specificity_test ?? g.specificity_test ?? "",
    "",
    "VS SYNOPSIS:",
    sections.relationship_with_synopsis ?? g.relationship_with_synopsis ?? "",
    "",
    "VS MOODS TAGS:",
    sections.relationship_with_moods_tags ??
      g.relationship_with_moods_tags ??
      "",
  ];

  const examples = (sections.good_examples ?? g.good_examples ?? []).slice(0, 8);
  if (examples.length) {
    lines.push("", "GOOD EXAMPLES (do not copy):");
    for (const ex of examples) {
      lines.push(
        `- "${ex.the_mood ?? ex.text ?? ""}"${ex.why ? ` — ${ex.why}` : ""}`
      );
    }
  }

  const anti = (sections.anti_examples ?? g.anti_examples ?? []).slice(0, 6);
  if (anti.length) {
    lines.push("", "ANTI-EXAMPLES (do not emulate):");
    for (const ex of anti) {
      lines.push(
        `- "${ex.the_mood ?? ex.text ?? ""}"${ex.why ? ` — ${ex.why}` : ""}`
      );
    }
  }

  return lines.filter((line) => line != null).join("\n");
}

/**
 * Pick a few good examples matching rough tag overlap.
 * @param {object} guide
 * @param {string[]} moods
 */
export function selectRelevantMoodExamples(guide, moods = [], limit = 4) {
  const g = guide?.final_guide ?? guide;
  const examples = g?.sections?.good_examples ?? g?.good_examples ?? [];
  if (!examples.length) return [];
  const tagSet = new Set((moods ?? []).map((t) => String(t).toLowerCase()));
  const scored = examples.map((ex) => {
    const exTags = (ex.moods ?? []).map((t) => String(t).toLowerCase());
    let score = 0;
    for (const tag of exTags) {
      if (tagSet.has(tag)) score += 1;
    }
    return { ex, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, limit).map((row) => row.ex);
  if (picked.length < limit) {
    return examples.slice(0, limit);
  }
  return picked;
}

/**
 * @param {object} artifact
 * @param {{ writeActive?: boolean, dryRun?: boolean }} [options]
 */
export function saveMoodWritingGuideArtifact(artifact, options = {}) {
  fs.mkdirSync(MOOD_GUIDE_REPORTS_DIR, { recursive: true });
  const version = artifact.version ?? MOOD_GUIDE_ID;
  const reportPath = path.join(MOOD_GUIDE_REPORTS_DIR, `${version}.json`);
  const payload = JSON.stringify(artifact, null, 2);
  if (!options.dryRun) {
    fs.writeFileSync(reportPath, payload);
    if (options.writeActive !== false) {
      fs.mkdirSync(path.dirname(MOOD_GUIDE_ACTIVE_PATH), { recursive: true });
      const active = {
        version: artifact.version,
        generated_at: artifact.generated_at,
        corpus_size: artifact.corpus_size,
        final_guide: artifact.final_guide,
        model: artifact.model ?? null,
      };
      fs.writeFileSync(MOOD_GUIDE_ACTIVE_PATH, JSON.stringify(active, null, 2));
    }
  }
  return { reportPath, activePath: MOOD_GUIDE_ACTIVE_PATH };
}
