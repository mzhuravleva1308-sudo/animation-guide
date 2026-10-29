#!/usr/bin/env node
/**
 * Offline A/B: storytelling_tags embeddings vs plot_charge embeddings.
 * Personalized top-N for a profile (default maria). Does NOT write production tables.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/experiment-plot-charge-embeddings.mjs
 *   APP_ENV=hosted node scripts/experiment-plot-charge-embeddings.mjs --profile=maria
 *   APP_ENV=hosted node scripts/experiment-plot-charge-embeddings.mjs --skip-embed
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { MEDIA_TYPE } from "../lib/media-type.mjs";
import {
  formatPlotChargeForEmbedding,
  normalizePlotCharge,
} from "../lib/animation-plot-charge.mjs";

await applyAppEnv({ prefer: "hosted" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "tmp", "experiment-plot-charge-embeddings");
const EMBED_PATH = path.join(OUT_DIR, "plot-charge-embeddings.json");

const PROFILE_SLUG =
  process.argv.find((a) => a.startsWith("--profile="))?.slice("--profile=".length) ??
  "maria";
const skipEmbed = process.argv.includes("--skip-embed");
const TOP_N = 10;
const LIKE_MIN = 7;
const MIN_COSINE = 0.72;
const EMBED_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const BATCH = 64;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseEmbedding(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === "string") {
    return value
      .replace("[", "")
      .replace("]", "")
      .split(",")
      .map((item) => Number(item.trim()));
  }
  return null;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function ratingWeight(rating) {
  if (rating >= 10) return 1;
  if (rating >= 9) return 0.9;
  if (rating >= 8) return 0.75;
  if (rating >= 7) return 0.55;
  return 0;
}

function effectiveCosine(sim) {
  if (!Number.isFinite(sim) || sim <= MIN_COSINE) return 0;
  return (sim - MIN_COSINE) / (1 - MIN_COSINE);
}

async function loadEmbeddingsTable(tableName, filmIds) {
  const map = new Map();
  for (let i = 0; i < filmIds.length; i += 200) {
    const chunk = filmIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from(tableName)
      .select("film_id, embedding")
      .in("film_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const embedding = parseEmbedding(row.embedding);
      if (embedding) map.set(row.film_id, embedding);
    }
  }
  return map;
}

async function embedTexts(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const response = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: batch,
    });
    const byIndex = new Map(response.data.map((row) => [row.index, row.embedding]));
    for (let j = 0; j < batch.length; j += 1) {
      out.push(byIndex.get(j));
    }
    process.stderr.write(`embed ${Math.min(i + BATCH, texts.length)}/${texts.length}\n`);
  }
  return out;
}

function softWeight(rating) {
  if (!Number.isFinite(rating) || rating < 1) return 0;
  return rating / 10;
}

function bestPull({ candidateId, anchors, embById, getRating, weightFn }) {
  let best = {
    score: 0,
    similarity: 0,
    via_id: null,
    via_title: null,
    via_rating: null,
  };
  const cand = embById.get(candidateId);
  if (!cand) return best;
  for (const a of anchors) {
    const rating = getRating(a);
    const w = weightFn(rating);
    if (w <= 0) continue;
    const anchorEmb = embById.get(a.id);
    if (!anchorEmb) continue;
    const sim = cosineSimilarity(cand, anchorEmb);
    const score = effectiveCosine(sim) * w;
    if (score > best.score || (score === best.score && sim > best.similarity)) {
      best = {
        score,
        similarity: sim,
        via_id: a.id,
        via_title: a.title,
        via_rating: rating,
      };
    }
  }
  return best;
}

function normalizeScores(rows, key) {
  const values = rows.map((r) => r[key]).filter((v) => Number.isFinite(v));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  if (max <= min) {
    return rows.map((r) => ({ ...r, [`${key}_n`]: 0 }));
  }
  return rows.map((r) => ({
    ...r,
    [`${key}_n`]: (r[key] - min) / (max - min),
  }));
}

function printTop(label, rows) {
  console.log(`\n=== ${label} ===`);
  if (!rows.length) {
    console.log("(empty)");
    return;
  }
  for (const row of rows) {
    const via =
      row.via ||
      `m:${row.mood_anchor ?? "—"} / v:${row.visual_anchor ?? "—"} / p:${row.plot_anchor ?? "—"}`;
    console.log(
      `${String(row.rank).padStart(2)}. ${row.title}  score=${row.score.toFixed(3)}  ${via}`
    );
  }
}

async function main() {
  ensureDir(OUT_DIR);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, slug")
    .eq("slug", PROFILE_SLUG)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error(`Profile not found: ${PROFILE_SLUG}`);

  const [{ data: ratings }, { data: details }, { data: films }] = await Promise.all([
    supabase
      .from("film_ratings")
      .select("film_id, rating")
      .eq("profile_id", profile.id),
    supabase
      .from("film_rating_details")
      .select("film_id, visual_rating, mood_rating, plot_rating")
      .eq("profile_id", profile.id),
    supabase
      .from("films")
      .select(
        "id, title, year, media_type, catalog_visible, storytelling_tags, plot_charge"
      )
      .eq("media_type", MEDIA_TYPE.animation)
      .eq("catalog_visible", true),
  ]);

  const filmById = new Map((films ?? []).map((f) => [f.id, f]));
  const detailById = new Map((details ?? []).map((d) => [d.film_id, d]));
  const withCharge = (films ?? []).filter((f) => normalizePlotCharge(f.plot_charge));
  console.log(`Profile: ${profile.slug}`);
  console.log(`Animation catalog: ${films?.length ?? 0}`);
  console.log(`With plot_charge: ${withCharge.length}`);

  // --- Build / load plot_charge embeddings (offline file) ---
  /** @type {Map<string, number[]>} */
  let chargeEmb = new Map();
  if (skipEmbed && fs.existsSync(EMBED_PATH)) {
    const saved = JSON.parse(fs.readFileSync(EMBED_PATH, "utf8"));
    for (const row of saved.films || []) {
      if (row.embedding) chargeEmb.set(row.id, row.embedding);
    }
    console.log(`Reused plot_charge embeddings: ${chargeEmb.size}`);
  } else if (fs.existsSync(EMBED_PATH) && !process.argv.includes("--force-embed")) {
    const saved = JSON.parse(fs.readFileSync(EMBED_PATH, "utf8"));
    for (const row of saved.films || []) {
      if (row.embedding) chargeEmb.set(row.id, row.embedding);
    }
    console.log(`Reused plot_charge embeddings: ${chargeEmb.size}`);
  } else {
    const texts = withCharge.map((f) => formatPlotChargeForEmbedding(f.plot_charge));
    console.log(`Embedding ${texts.length} plot_charge texts (${EMBED_MODEL})…`);
    const vectors = await embedTexts(texts);
    const payloadFilms = withCharge.map((f, i) => ({
      id: f.id,
      title: f.title,
      text: texts[i],
      embedding: vectors[i],
    }));
    for (const row of payloadFilms) chargeEmb.set(row.id, row.embedding);
    fs.writeFileSync(
      EMBED_PATH,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          model: EMBED_MODEL,
          films: payloadFilms,
        },
        null,
        2
      )
    );
    console.log(`Wrote ${EMBED_PATH}`);
  }

  // Anchors: every rated film; missing detail → overall on all axes (same as axis experiment).
  const anchors = [...(ratings ?? [])]
    .map((r) => {
      const film = filmById.get(r.film_id);
      const overall = Number(r.rating);
      if (!film || !Number.isFinite(overall)) return null;
      const detail = detailById.get(r.film_id);
      const hasDetail = Boolean(detail);
      return {
        id: film.id,
        title: film.title,
        overall,
        hasDetail,
        mood: hasDetail ? Number(detail.mood_rating) : overall,
        visual: hasDetail ? Number(detail.visual_rating) : overall,
        plot: hasDetail ? Number(detail.plot_rating) : overall,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.overall - a.overall || String(a.title).localeCompare(String(b.title))
    );

  const ratedIds = new Set(anchors.map((a) => a.id));
  const candidateFilms = (films ?? []).filter((f) => !ratedIds.has(f.id));
  const allIds = [
    ...new Set([
      ...candidateFilms.map((f) => f.id),
      ...anchors.map((a) => a.id),
    ]),
  ];

  const [moodEmb, visualEmb, tagEmb] = await Promise.all([
    loadEmbeddingsTable("film_mood_embeddings", allIds),
    loadEmbeddingsTable("film_aesthetic_embeddings", allIds),
    loadEmbeddingsTable("film_storytelling_embeddings", allIds),
  ]);

  console.log(`Rated anchors: ${anchors.length} (${anchors.filter((a) => a.hasDetail).length} with axis detail)`);
  console.log(`Candidates: ${candidateFilms.length}`);
  console.log(
    `Embeddings: mood=${moodEmb.size} visual=${visualEmb.size} tags=${tagEmb.size} charge=${[...allIds].filter((id) => chargeEmb.has(id)).length}`
  );
  console.log(
    `3-axis: mood + visual + plot; plot A=tags / B=charge; soft weights; cosine>${MIN_COSINE}`
  );

  const weightFn = softWeight;

  function scoreCandidates(plotEmb) {
    const scored = candidateFilms.map((film) => {
      const mood = bestPull({
        candidateId: film.id,
        anchors,
        embById: moodEmb,
        getRating: (a) => a.mood,
        weightFn,
      });
      const visual = bestPull({
        candidateId: film.id,
        anchors,
        embById: visualEmb,
        getRating: (a) => a.visual,
        weightFn,
      });
      const plot = bestPull({
        candidateId: film.id,
        anchors,
        embById: plotEmb,
        getRating: (a) => a.plot,
        weightFn,
      });
      return {
        id: film.id,
        title: film.title,
        year: film.year,
        mood: mood.score,
        mood_anchor: mood.via_title,
        visual: visual.score,
        visual_anchor: visual.via_title,
        plot: plot.score,
        plot_anchor: plot.via_title,
      };
    });

    let withNorm = normalizeScores(scored, "mood");
    withNorm = normalizeScores(withNorm, "visual");
    withNorm = normalizeScores(withNorm, "plot");
    return withNorm
      .map((row) => ({
        ...row,
        overall: (row.mood_n + row.visual_n + row.plot_n) / 3,
      }))
      .sort(
        (a, b) =>
          b.overall - a.overall ||
          String(a.title).localeCompare(String(b.title))
      );
  }

  const rankedTags = scoreCandidates(tagEmb);
  const rankedCharge = scoreCandidates(chargeEmb);

  const topTags = rankedTags.slice(0, TOP_N).map((row, i) => ({
    rank: i + 1,
    title: row.title,
    score: row.overall,
    mood_n: row.mood_n,
    visual_n: row.visual_n,
    plot_n: row.plot_n,
    mood_anchor: row.mood_anchor,
    visual_anchor: row.visual_anchor,
    plot_anchor: row.plot_anchor,
  }));
  const topCharge = rankedCharge.slice(0, TOP_N).map((row, i) => ({
    rank: i + 1,
    title: row.title,
    score: row.overall,
    mood_n: row.mood_n,
    visual_n: row.visual_n,
    plot_n: row.plot_n,
    mood_anchor: row.mood_anchor,
    visual_anchor: row.visual_anchor,
    plot_anchor: row.plot_anchor,
  }));

  printTop("A · 3-axis (mood + visual + plot TAGS)", topTags);
  printTop("B · 3-axis (mood + visual + plot CHARGE)", topCharge);

  // Also show plot-only tops for context
  const plotOnlyTags = [...rankedTags]
    .sort((a, b) => b.plot - a.plot || a.title.localeCompare(b.title))
    .slice(0, TOP_N)
    .map((row, i) => ({
      rank: i + 1,
      title: row.title,
      score: row.plot,
      via: `via ${row.plot_anchor ?? "—"}`,
    }));
  const plotOnlyCharge = [...rankedCharge]
    .sort((a, b) => b.plot - a.plot || a.title.localeCompare(b.title))
    .slice(0, TOP_N)
    .map((row, i) => ({
      rank: i + 1,
      title: row.title,
      score: row.plot,
      via: `via ${row.plot_anchor ?? "—"}`,
    }));
  printTop("(ref) plot-only tags", plotOnlyTags);
  printTop("(ref) plot-only charge", plotOnlyCharge);

  const tagTitles = new Set(topTags.map((r) => r.title));
  const chargeTitles = new Set(topCharge.map((r) => r.title));
  const onlyTags = topTags.filter((r) => !chargeTitles.has(r.title)).map((r) => r.title);
  const onlyCharge = topCharge.filter((r) => !tagTitles.has(r.title)).map((r) => r.title);
  const both = topTags.filter((r) => chargeTitles.has(r.title)).map((r) => r.title);

  console.log("\n=== Diff (3-axis top 10) ===");
  console.log(`In both: ${both.join(", ") || "—"}`);
  console.log(`Only tags: ${onlyTags.join(", ") || "—"}`);
  console.log(`Only charge: ${onlyCharge.join(", ") || "—"}`);

  // Rank moves for shared + notable titles
  const rankIn = (rows, title) => {
    const hit = rows.find((r) => r.title === title);
    return hit ? hit.rank : null;
  };
  const moveTitles = [...new Set([...both, ...onlyTags, ...onlyCharge])];
  console.log("\n=== Rank map (A tags → B charge) ===");
  for (const title of moveTitles) {
    const a = rankIn(topTags, title);
    const b = rankIn(topCharge, title);
    console.log(
      `  ${title}: ${a ?? "—"} → ${b ?? "—"}`
    );
  }

  const results = {
    generated_at: new Date().toISOString(),
    profile: profile.slug,
    model: EMBED_MODEL,
    mode: "3axis_mood_visual_plot",
    min_cosine: MIN_COSINE,
    anchors: anchors.map((a) => ({
      title: a.title,
      overall: a.overall,
      mood: a.mood,
      visual: a.visual,
      plot: a.plot,
      hasDetail: a.hasDetail,
    })),
    top_3axis_tags: topTags,
    top_3axis_charge: topCharge,
    plot_only_tags: plotOnlyTags,
    plot_only_charge: plotOnlyCharge,
    both,
    only_tags: onlyTags,
    only_charge: onlyCharge,
  };
  const outPath = path.join(OUT_DIR, `compare-3axis-${profile.slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

  const md = [];
  md.push(`# 3-axis: tags plot vs charge plot · ${profile.slug}`);
  md.push("");
  md.push(
    "Mood + visual fixed. Only plot axis swaps: storytelling_tags embeddings vs plot_charge embeddings."
  );
  md.push(`Soft rating weights. Cosine gate ${MIN_COSINE}. Offline / not production.`);
  md.push("");
  md.push("## A · mood + visual + plot(tags)");
  for (const r of topTags) {
    md.push(
      `${r.rank}. **${r.title}** — ${r.score.toFixed(3)} (m ${r.mood_n.toFixed(2)} / v ${r.visual_n.toFixed(2)} / p ${r.plot_n.toFixed(2)}) · via m:${r.mood_anchor} v:${r.visual_anchor} p:${r.plot_anchor}`
    );
  }
  md.push("");
  md.push("## B · mood + visual + plot(charge)");
  for (const r of topCharge) {
    md.push(
      `${r.rank}. **${r.title}** — ${r.score.toFixed(3)} (m ${r.mood_n.toFixed(2)} / v ${r.visual_n.toFixed(2)} / p ${r.plot_n.toFixed(2)}) · via m:${r.mood_anchor} v:${r.visual_anchor} p:${r.plot_anchor}`
    );
  }
  md.push("");
  md.push("## Diff");
  md.push(`- Both: ${both.join(", ") || "—"}`);
  md.push(`- Only tags: ${onlyTags.join(", ") || "—"}`);
  md.push(`- Only charge: ${onlyCharge.join(", ") || "—"}`);
  fs.writeFileSync(path.join(OUT_DIR, `compare-3axis-${profile.slug}.md`), md.join("\n"));
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
