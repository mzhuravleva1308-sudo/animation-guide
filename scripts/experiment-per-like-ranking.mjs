#!/usr/bin/env node
/**
 * Read-only ranking experiment: current Films sort vs each-like-pulls-a-neighbor.
 * Does not write profile_film_scores.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/experiment-per-like-ranking.mjs --profile=maria
 *   APP_ENV=hosted node scripts/experiment-per-like-ranking.mjs --profile=maria --media=animation
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { MEDIA_TYPE, SCORE_MODE } from "../lib/media-type.mjs";
import { buildBalancedScores } from "../lib/profile-film-scoring.mjs";
import {
  TOP_N,
  likeIdsOnAnyAxis,
  rankBaseline,
  rankPerLikeByPairScore,
  axesScoreAgainstLike,
  rankSameAnchorCap,
  threeAxisScoreAgainstLike,
  uniqueAnchorsInTop,
} from "../lib/experiment-per-like-ranking.mjs";
import {
  calculateProfileScores,
  getAllFilms,
  getProfiles,
} from "./rebuild-profile-film-scores.mjs";

applyAppEnv();

const WOMEN_TITLE = "20th Century Women";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const profileArg = argv.find((arg) => arg.startsWith("--profile="));
  const mediaArg = argv.find((arg) => arg.startsWith("--media="));
  const mediaRaw = mediaArg?.slice("--media=".length) ?? MEDIA_TYPE.liveAction;
  const mediaType =
    mediaRaw === "animation" || mediaRaw === MEDIA_TYPE.animation
      ? MEDIA_TYPE.animation
      : MEDIA_TYPE.liveAction;
  return {
    profileSlug: profileArg?.slice("--profile=".length) ?? "maria",
    mediaType,
  };
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

async function loadEmbeddings(supabase, tableName, filmIds) {
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
      if (embedding) {
        map.set(row.film_id, embedding);
      }
    }
  }
  return map;
}

function formatRow(film, index, balancedScores, gatedById, extra = {}) {
  const gated = gatedById.get(film.id);
  const score = balancedScores.get(film.id);
  return {
    rank: index + 1,
    title: film.title,
    balanced: Number((score?.balanced ?? 0).toFixed(4)),
    emotional_anchor: gated?.emotionalAnchor?.anchorTitle ?? null,
    visual_world_anchor: gated?.visualWorldAnchor?.anchorTitle ?? null,
    storytelling_anchor: gated?.storytellingAnchor?.anchorTitle ?? null,
    material_anchor: gated?.materialAnchor?.anchorTitle ?? null,
    profile_gate: gated?.profileGate ?? null,
    ...extra,
  };
}

function rankOfTitle(films, title) {
  const index = films.findIndex((film) => film.title === title);
  return index < 0 ? null : index + 1;
}

function printList(label, rows, { mediaType } = {}) {
  console.log(`\n${label}`);
  const isAnimation = mediaType === MEDIA_TYPE.animation;
  for (const row of rows) {
    const pulled = row.pulled_by
      ? `  pulled_by=${row.pulled_by}  pair=${row.pair_score ?? "—"}`
      : "";
    const axes = isAnimation
      ? `mood→${row.emotional_anchor ?? "—"}  mat→${row.material_anchor ?? "—"}`
      : `mood→${row.emotional_anchor ?? "—"}  vw→${row.visual_world_anchor ?? "—"}  st→${row.storytelling_anchor ?? "—"}`;
    console.log(
      `  ${String(row.rank).padStart(2)}. ${row.title}  ` +
        `bal=${row.balanced}  ${axes}${pulled}`
    );
  }
}

async function main() {
  const { profileSlug, mediaType } = parseArgs(process.argv.slice(2));
  const isAnimation = mediaType === MEDIA_TYPE.animation;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const profiles = await getProfiles(profileSlug);
  if (!profiles.length) {
    throw new Error(`No profile found for slug: ${profileSlug}`);
  }
  const profile = profiles[0];
  const allFilms = await getAllFilms();

  const diagnostics = await calculateProfileScores(profile, allFilms, {
    mediaType,
    scoreMode: SCORE_MODE.native,
    sourceMedia: mediaType,
    quiet: true,
    diagnostics: true,
  });

  const { candidateFilms, ratedFilms, gatedScoresByFilmId, scoreRows } =
    diagnostics;
  const visibleCandidates = candidateFilms.filter(
    (film) => film.catalog_visible !== false
  );

  const rawById = new Map(
    scoreRows.map((row) => [
      row.film_id,
      {
        emotional: row.emotional_score,
        material: row.material_score,
        visual_world: row.visual_world_score,
        storytelling: row.storytelling_score,
      },
    ])
  );
  const balancedScores = buildBalancedScores(visibleCandidates, rawById, {
    mediaType,
    scoreMode: SCORE_MODE.native,
  });

  const embedIds = [
    ...new Set([
      ...ratedFilms.map((film) => film.id),
      ...visibleCandidates.map((film) => film.id),
    ]),
  ];
  const [mood, aesthetic, visualWorld, storytelling] = await Promise.all([
    loadEmbeddings(supabase, "film_mood_embeddings", embedIds),
    isAnimation
      ? loadEmbeddings(supabase, "film_aesthetic_embeddings", embedIds)
      : Promise.resolve(new Map()),
    isAnimation
      ? Promise.resolve(new Map())
      : loadEmbeddings(supabase, "film_visual_world_embeddings", embedIds),
    isAnimation
      ? Promise.resolve(new Map())
      : loadEmbeddings(supabase, "film_storytelling_embeddings", embedIds),
  ]);

  const scoreAgainstLike = (candidate, like) => {
    const profileGate =
      gatedScoresByFilmId.get(candidate.id)?.profileGate ?? 1;
    if (isAnimation) {
      return axesScoreAgainstLike({
        sims: [
          cosineSimilarity(mood.get(candidate.id), mood.get(like.id)),
          cosineSimilarity(
            aesthetic.get(candidate.id),
            aesthetic.get(like.id)
          ),
        ],
        likeRating: like.rating,
        profileGate,
      });
    }
    return threeAxisScoreAgainstLike({
      emotionalSim: cosineSimilarity(mood.get(candidate.id), mood.get(like.id)),
      visualWorldSim: cosineSimilarity(
        visualWorld.get(candidate.id),
        visualWorld.get(like.id)
      ),
      storytellingSim: cosineSimilarity(
        storytelling.get(candidate.id),
        storytelling.get(like.id)
      ),
      likeRating: like.rating,
      profileGate,
    });
  };

  const baselineFilms = rankBaseline(visibleCandidates, balancedScores);
  const capFilms = rankSameAnchorCap(
    visibleCandidates,
    balancedScores,
    gatedScoresByFilmId
  );
  const perLike = rankPerLikeByPairScore({
    likes: ratedFilms,
    candidates: visibleCandidates,
    scoreAgainstLike,
    tailScores: balancedScores,
    limit: TOP_N,
  });

  const pulledByFilmId = new Map(
    perLike.pulled.map((row) => [row.film.id, row])
  );

  const listA = baselineFilms
    .slice(0, TOP_N)
    .map((film, index) =>
      formatRow(film, index, balancedScores, gatedScoresByFilmId)
    );
  const listB = perLike.films.slice(0, TOP_N).map((film, index) => {
    const pulled = pulledByFilmId.get(film.id);
    return formatRow(film, index, balancedScores, gatedScoresByFilmId, {
      pulled_by: pulled?.pulledBy?.title ?? null,
      pair_score:
        pulled?.pairScore == null ? null : Number(pulled.pairScore.toFixed(4)),
    });
  });
  const listC = capFilms
    .slice(0, TOP_N)
    .map((film, index) =>
      formatRow(film, index, balancedScores, gatedScoresByFilmId)
    );

  const women = ratedFilms.find((film) => film.title === WOMEN_TITLE);
  const womenNeighborTitles = visibleCandidates
    .filter((film) =>
      women ? likeIdsOnAnyAxis(gatedScoresByFilmId.get(film.id)).has(women.id) : false
    )
    .map((film) => film.title)
    .sort((a, b) => a.localeCompare(b));

  const womenNeighborRanks = womenNeighborTitles.map((title) => ({
    title,
    baseline: rankOfTitle(baselineFilms, title),
    per_like: rankOfTitle(perLike.films, title),
    same_anchor_cap: rankOfTitle(capFilms, title),
  }));

  const uniquePulledBy = (rows, n) => [
    ...new Set(
      rows.slice(0, n).map((row) => row.pulled_by).filter(Boolean)
    ),
  ];

  const summary = {
    generated_at: new Date().toISOString(),
    media_type: mediaType,
    profile: { id: profile.id, slug: profile.slug, name: profile.name },
    likes: ratedFilms
      .slice()
      .sort(
        (a, b) =>
          Number(b.rating ?? 0) - Number(a.rating ?? 0) ||
          String(a.title).localeCompare(String(b.title))
      )
      .map((film) => ({ title: film.title, rating: film.rating })),
    unique_emotional_anchors: {
      baseline_top7: [...uniqueAnchorsInTop(baselineFilms, gatedScoresByFilmId, 7).titles],
      baseline_top15: [
        ...uniqueAnchorsInTop(baselineFilms, gatedScoresByFilmId, 15).titles,
      ],
      per_like_top7: [...uniqueAnchorsInTop(perLike.films, gatedScoresByFilmId, 7).titles],
      per_like_top15: [
        ...uniqueAnchorsInTop(perLike.films, gatedScoresByFilmId, 15).titles,
      ],
      same_anchor_cap_top7: [
        ...uniqueAnchorsInTop(capFilms, gatedScoresByFilmId, 7).titles,
      ],
      same_anchor_cap_top15: [
        ...uniqueAnchorsInTop(capFilms, gatedScoresByFilmId, 15).titles,
      ],
    },
    unique_pulled_by: {
      per_like_top7: uniquePulledBy(listB, 7),
      per_like_top15: uniquePulledBy(listB, 15),
    },
    women_neighbors_any_axis: isAnimation ? [] : womenNeighborRanks,
    A_baseline: listA,
    B_per_like: listB,
    C_same_anchor_cap: listC,
  };

  const outDir = path.join(ROOT, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    isAnimation
      ? `experiment-per-like-ranking-${profile.slug}-animation.json`
      : `experiment-per-like-ranking-${profile.slug}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));

  const pairLabel = isAnimation
    ? "2-axis score vs that like (mood + material)"
    : "3-axis score vs that like";

  console.log(
    `Profile ${profile.slug}  media=${mediaType}  likes≥7=${ratedFilms.length}  candidates=${visibleCandidates.length}`
  );
  console.log(`Wrote ${outPath} (no score table writes)`);
  console.log(
    "Unique emotional anchors top7/15:",
    JSON.stringify(summary.unique_emotional_anchors)
  );
  console.log(
    "B unique pulled_by:",
    JSON.stringify(summary.unique_pulled_by)
  );
  printList("A. Baseline", listA, { mediaType });
  printList(`B. Per-like (${pairLabel})`, listB, { mediaType });
  if (!isAnimation) {
    const womenPull = perLike.pulled.find(
      (row) => row.pulledBy?.title === WOMEN_TITLE
    );
    if (womenPull) {
      console.log(
        `  → ${WOMEN_TITLE} nearest by 3-axis score: ${womenPull.film.title} (pair=${womenPull.pairScore.toFixed(4)})`
      );
    }
    printList("C. Same-anchor cap (max 2 in top 7)", listC, { mediaType });
    console.log("\n20th Century Women neighbors (nearest on any axis):");
    for (const row of womenNeighborRanks) {
      console.log(
        `  ${row.title}: A=${row.baseline ?? "—"}  B=${row.per_like ?? "—"}  C=${row.same_anchor_cap ?? "—"}`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
