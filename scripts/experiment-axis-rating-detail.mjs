#!/usr/bin/env node
/**
 * Read-only: rerank animation catalog using film_rating_details
 * (visual / mood / plot) when present; otherwise overall rating is
 * applied equally on all three axes.
 *
 * Axis mapping for animation:
 *   mood    → film_mood_embeddings
 *   visual  → film_aesthetic_embeddings  (material / craft)
 *   plot    → film_storytelling_embeddings (rich storytelling_tags)
 *
 * Does not write profile_film_scores or release anything.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/experiment-axis-rating-detail.mjs --profile=maria
 */

import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { MEDIA_TYPE } from "../lib/media-type.mjs";

applyAppEnv();

const TOP_N = 15;
const MIN_COSINE = 0.72;
const PROFILE_SLUG =
  process.argv.find((a) => a.startsWith("--profile="))?.slice(10) ?? "maria";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

/** Production gate: ≥7. */
function productionWeight(rating) {
  if (rating >= 10) return 1;
  if (rating >= 9) return 0.9;
  if (rating >= 8) return 0.75;
  if (rating >= 7) return 0.55;
  return 0;
}

/** Soft linear weight so mid scores (4–6) still contribute in the experiment. */
function softWeight(rating) {
  if (!Number.isFinite(rating) || rating < 1) return 0;
  return rating / 10;
}

function effectiveCosine(sim) {
  if (!Number.isFinite(sim) || sim <= MIN_COSINE) return 0;
  return (sim - MIN_COSINE) / (1 - MIN_COSINE);
}

async function loadEmbeddings(tableName, filmIds) {
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

function bestAxisSignal({
  candidateId,
  anchors,
  getSim,
  getRating,
  weightFn,
}) {
  let best = {
    score: 0,
    anchorTitle: null,
    anchorRating: null,
    similarity: 0,
  };
  for (const anchor of anchors) {
    const rating = getRating(anchor);
    const weight = weightFn(rating);
    if (weight <= 0) continue;
    const sim = getSim(candidateId, anchor.id);
    const eff = effectiveCosine(sim);
    const signal = eff * weight;
    if (signal > best.score) {
      best = {
        score: signal,
        anchorTitle: anchor.title,
        anchorRating: rating,
        similarity: sim,
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

function printBlock(title, rows) {
  console.log(`\n=== ${title} ===`);
  for (const row of rows) {
    const bits = [
      `${String(row.rank).padStart(2)}. ${row.title}`,
      `score=${row.score.toFixed(3)}`,
    ];
    if (row.anchor) bits.push(`via ${row.anchor} (${row.anchorRating})`);
    console.log(bits.join("  |  "));
  }
}

async function main() {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, slug")
    .eq("slug", PROFILE_SLUG)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error(`Profile not found: ${PROFILE_SLUG}`);

  const [{ data: details }, { data: ratings }, { data: films }] =
    await Promise.all([
      supabase
        .from("film_rating_details")
        .select("film_id, visual_rating, mood_rating, plot_rating")
        .eq("profile_id", profile.id),
      supabase
        .from("film_ratings")
        .select("film_id, rating")
        .eq("profile_id", profile.id),
      supabase
        .from("films")
        .select(
          "id, title, year, media_type, catalog_visible, moods, aesthetic_tags, storytelling_tags"
        )
        .eq("media_type", MEDIA_TYPE.animation)
        .eq("catalog_visible", true),
    ]);

  const filmById = new Map((films ?? []).map((f) => [f.id, f]));
  const ratingById = new Map(
    (ratings ?? []).map((r) => [r.film_id, Number(r.rating)])
  );
  const detailById = new Map((details ?? []).map((d) => [d.film_id, d]));

  // Every rated animation film is an anchor. Missing detail → overall on all axes.
  const anchors = [...ratingById.entries()]
    .map(([filmId, overall]) => {
      const film = filmById.get(filmId);
      if (!film || !Number.isFinite(overall)) return null;
      const detail = detailById.get(filmId);
      const hasDetail = Boolean(detail);
      return {
        id: filmId,
        title: film.title,
        overall,
        hasDetail,
        visual: hasDetail ? detail.visual_rating : overall,
        mood: hasDetail ? detail.mood_rating : overall,
        plot: hasDetail ? detail.plot_rating : overall,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.overall - a.overall || String(a.title).localeCompare(String(b.title))
    );

  const ratedIds = new Set(anchors.map((a) => a.id));
  const candidates = (films ?? []).filter((f) => !ratedIds.has(f.id));
  const allIds = [
    ...new Set([...candidates.map((f) => f.id), ...anchors.map((a) => a.id)]),
  ];

  const [moodEmb, aestheticEmb, storytellingEmb] = await Promise.all([
    loadEmbeddings("film_mood_embeddings", allIds),
    loadEmbeddings("film_aesthetic_embeddings", allIds),
    loadEmbeddings("film_storytelling_embeddings", allIds),
  ]);

  const detailCount = anchors.filter((a) => a.hasDetail).length;
  const fallbackCount = anchors.length - detailCount;

  console.log(`Profile: ${profile.slug}`);
  console.log(`Animation catalog: ${films?.length ?? 0}`);
  console.log(`Unrated candidates: ${candidates.length}`);
  console.log(
    `Axis anchors: ${anchors.length} (${detailCount} with detail, ${fallbackCount} overall→all axes)`
  );
  console.log("\nAnchors with detail:");
  for (const a of anchors.filter((row) => row.hasDetail)) {
    console.log(
      `  - ${a.title}: overall=${a.overall}  visual=${a.visual}  mood=${a.mood}  plot=${a.plot}`
    );
  }

  const prodVisualAnchors = anchors.filter((a) => productionWeight(a.visual) > 0);
  const prodMoodAnchors = anchors.filter((a) => productionWeight(a.mood) > 0);
  const prodPlotAnchors = anchors.filter((a) => productionWeight(a.plot) > 0);
  console.log("\nWith production ≥7 weight gate (counts):");
  console.log(`  visual pulls: ${prodVisualAnchors.length}`);
  console.log(`  mood pulls: ${prodMoodAnchors.length}`);
  console.log(`  plot pulls: ${prodPlotAnchors.length}`);
  console.log(
    `\nPlot axis: film_storytelling_embeddings (${storytellingEmb.size}/${allIds.length} loaded)`
  );
  console.log("Soft rating weights (rating/10); production ≥7 gate shown above only.");

  const weightFn = softWeight;

  const scored = candidates.map((film) => {
    const mood = bestAxisSignal({
      candidateId: film.id,
      anchors,
      getSim: (candId, anchorId) =>
        cosineSimilarity(moodEmb.get(candId), moodEmb.get(anchorId)),
      getRating: (a) => a.mood,
      weightFn,
    });
    const visual = bestAxisSignal({
      candidateId: film.id,
      anchors,
      getSim: (candId, anchorId) =>
        cosineSimilarity(aestheticEmb.get(candId), aestheticEmb.get(anchorId)),
      getRating: (a) => a.visual,
      weightFn,
    });
    const plot = bestAxisSignal({
      candidateId: film.id,
      anchors,
      getSim: (candId, anchorId) =>
        cosineSimilarity(
          storytellingEmb.get(candId),
          storytellingEmb.get(anchorId)
        ),
      getRating: (a) => a.plot,
      weightFn,
    });

    return {
      id: film.id,
      title: film.title,
      year: film.year,
      mood: mood.score,
      mood_anchor: mood.anchorTitle,
      mood_anchor_rating: mood.anchorRating,
      visual: visual.score,
      visual_anchor: visual.anchorTitle,
      visual_anchor_rating: visual.anchorRating,
      plot: plot.score,
      plot_anchor: plot.anchorTitle,
      plot_anchor_rating: plot.anchorRating,
    };
  });

  let withNorm = normalizeScores(scored, "mood");
  withNorm = normalizeScores(withNorm, "visual");
  withNorm = normalizeScores(withNorm, "plot");
  withNorm = withNorm.map((row) => ({
    ...row,
    overall: (row.mood_n + row.visual_n + row.plot_n) / 3,
  }));

  const topOverall = [...withNorm]
    .sort(
      (a, b) =>
        b.overall - a.overall ||
        String(a.title).localeCompare(String(b.title))
    )
    .slice(0, TOP_N)
    .map((row, i) => ({
      rank: i + 1,
      title: row.title,
      score: row.overall,
      anchor: `m:${row.mood_anchor ?? "—"} / v:${row.visual_anchor ?? "—"} / p:${row.plot_anchor ?? "—"}`,
      anchorRating: `${row.mood_anchor_rating ?? "-"}/${row.visual_anchor_rating ?? "-"}/${row.plot_anchor_rating ?? "-"}`,
    }));

  const topMood = [...withNorm]
    .sort((a, b) => b.mood - a.mood || String(a.title).localeCompare(String(b.title)))
    .slice(0, TOP_N)
    .map((row, i) => ({
      rank: i + 1,
      title: row.title,
      score: row.mood,
      anchor: row.mood_anchor,
      anchorRating: row.mood_anchor_rating,
    }));

  const topVisual = [...withNorm]
    .sort(
      (a, b) =>
        b.visual - a.visual || String(a.title).localeCompare(String(b.title))
    )
    .slice(0, TOP_N)
    .map((row, i) => ({
      rank: i + 1,
      title: row.title,
      score: row.visual,
      anchor: row.visual_anchor,
      anchorRating: row.visual_anchor_rating,
    }));

  const topPlot = [...withNorm]
    .sort((a, b) => b.plot - a.plot || String(a.title).localeCompare(String(b.title)))
    .slice(0, TOP_N)
    .map((row, i) => ({
      rank: i + 1,
      title: row.title,
      score: row.plot,
      anchor: row.plot_anchor,
      anchorRating: row.plot_anchor_rating,
    }));

  printBlock("1) Best overall (equal mood + visual + plot)", topOverall);
  printBlock("2a) Best mood matches", topMood);
  printBlock("2b) Best visual matches (via aesthetic embeddings)", topVisual);
  printBlock("2c) Best plot matches (via storytelling embeddings)", topPlot);

  const nonzero = {
    mood: withNorm.filter((r) => r.mood > 0).length,
    visual: withNorm.filter((r) => r.visual > 0).length,
    plot: withNorm.filter((r) => r.plot > 0).length,
  };
  console.log("\nCandidates with non-zero axis signal:", nonzero);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
