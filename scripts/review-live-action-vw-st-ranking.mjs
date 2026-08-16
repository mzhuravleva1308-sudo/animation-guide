/**
 * Review report for live-action Mood × Visual World × Storytelling ranking.
 *
 * Usage:
 *   node scripts/review-live-action-vw-st-ranking.mjs --profile=<slug>
 */

import { applyAppEnv } from "./load-app-env.mjs";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { MEDIA_TYPE, SCORE_MODE } from "../lib/media-type.mjs";
import {
  buildBalancedScores,
  sortFilmsByScore,
} from "../lib/profile-film-scoring.mjs";
import {
  calculateProfileScores,
  getAllFilms,
  getProfiles,
} from "./rebuild-profile-film-scores.mjs";

applyAppEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!supabaseKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, supabaseKey);

const HIGHLIGHT_TITLES = [
  "Breath",
  "Les Choristes",
  "Little Forest",
  "Perfect Days",
  "Portrait of a Lady on Fire",
  "Sorry, Baby",
  "The Banshees of Inisherin",
  "The Taste of Things",
  "Tracks",
  "The Eight Mountains",
  "Godland",
  "The Handmaiden",
];

function parseArgs(argv) {
  const profileArg = argv.find((arg) => arg.startsWith("--profile="));
  return {
    profileSlug: profileArg?.slice("--profile=".length) ?? null,
  };
}

function countFrequencies(films, field) {
  const counts = new Map();
  for (const film of films) {
    for (const raw of film[field] ?? []) {
      const tag = String(raw).trim().toLowerCase();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({
      tag,
      count,
      share: Number((count / Math.max(1, films.length)).toFixed(3)),
    }));
}

function findFilm(films, title) {
  const needle = title.toLowerCase();
  return (
    films.find((film) => film.title?.toLowerCase() === needle) ??
    films.find((film) => film.title?.toLowerCase().includes(needle)) ??
    null
  );
}

async function loadStoredNativeScores(profileId) {
  const { data, error } = await supabase
    .from("profile_film_scores")
    .select(
      "film_id, emotional_score, material_score, visual_world_score, storytelling_score"
    )
    .eq("profile_id", profileId)
    .eq("score_mode", SCORE_MODE.native)
    .eq("source_media", MEDIA_TYPE.liveAction);
  if (error) throw error;
  return data ?? [];
}

async function loadTasteCores(profileId) {
  const { data, error } = await supabase
    .from("profile_taste_cores")
    .select(
      "core_type, core_index, strength, coverage, film_titles, emotional_profile_tags, aesthetic_profile_tags, visual_world_profile_tags, storytelling_profile_tags"
    )
    .eq("profile_id", profileId)
    .eq("media_type", MEDIA_TYPE.liveAction)
    .order("core_type")
    .order("core_index");
  if (error) throw error;
  return data ?? [];
}

async function main() {
  const { profileSlug } = parseArgs(process.argv.slice(2));
  const profiles = await getProfiles(profileSlug);
  if (!profiles.length) {
    throw new Error(
      profileSlug
        ? `No profile found for slug: ${profileSlug}`
        : "Pass --profile=<slug>"
    );
  }
  const profile = profiles[0];
  const allFilms = await getAllFilms();
  const liveActionFilms = allFilms.filter(
    (film) => film.media_type === MEDIA_TYPE.liveAction
  );

  const { data: ratings } = await supabase
    .from("film_ratings")
    .select("film_id, rating")
    .eq("profile_id", profile.id);
  const ratingByFilmId = new Map(
    (ratings ?? []).map((row) => [row.film_id, row.rating])
  );
  const ratedLiveAction = liveActionFilms
    .map((film) => ({
      ...film,
      rating: ratingByFilmId.get(film.id) ?? null,
    }))
    .filter((film) => film.rating != null);

  // Snapshot old material-based ranking for comparison (recompute with aesthetic path).
  const oldRows = await calculateProfileScores(profile, allFilms, {
    mediaType: MEDIA_TYPE.liveAction,
    scoreMode: SCORE_MODE.native,
    sourceMedia: MEDIA_TYPE.liveAction,
    quiet: true,
  });
  // Note: calculateProfileScores already uses new LA axes. For old comparison we
  // use currently stored material_score if present from before rebuild; otherwise
  // reconstruct a mood+material ranking from stored aesthetic embeddings via a
  // temporary override is not available. Instead compare against previous report
  // file if present, and also show material_score column from DB before overwrite.
  const previousReportPath = path.join(
    process.cwd(),
    "tmp",
    "la-vw-st-previous-top20.json"
  );
  let previousTop20 = null;
  if (fs.existsSync(previousReportPath)) {
    previousTop20 = JSON.parse(fs.readFileSync(previousReportPath, "utf8"));
  }

  const scoreRows = await loadStoredNativeScores(profile.id);
  const candidateFilms = liveActionFilms.filter(
    (film) => (ratingByFilmId.get(film.id) ?? 0) < 7
  );
  const rawById = new Map(
    scoreRows.map((row) => [
      row.film_id,
      {
        emotional: Number(row.emotional_score ?? 0),
        material: Number(row.material_score ?? 0),
        visual_world: Number(row.visual_world_score ?? 0),
        storytelling: Number(row.storytelling_score ?? 0),
      },
    ])
  );
  const balanced = buildBalancedScores(candidateFilms, rawById, {
    mediaType: MEDIA_TYPE.liveAction,
    scoreMode: SCORE_MODE.native,
  });
  const ranked = sortFilmsByScore(candidateFilms, balanced);
  const top20 = ranked.slice(0, 20).map((film, index) => {
    const score = balanced.get(film.id);
    return {
      rank: index + 1,
      id: film.id,
      title: film.title,
      total_score: Number((score?.balanced ?? 0).toFixed(4)),
      mood_score: Number((score?.emotional ?? 0).toFixed(4)),
      visual_world_score: Number((score?.visual_world ?? 0).toFixed(4)),
      storytelling_score: Number((score?.storytelling ?? 0).toFixed(4)),
      moods: film.moods ?? [],
      visual_world_tags: film.visual_world_tags ?? [],
      storytelling_tags: film.storytelling_tags ?? [],
      aesthetic_tags_legacy: film.aesthetic_tags ?? [],
    };
  });

  // Persist current top20 as previous for next comparison runs.
  fs.mkdirSync(path.join(process.cwd(), "tmp"), { recursive: true });
  fs.writeFileSync(previousReportPath, JSON.stringify(top20, null, 2));

  const previousRankByTitle = new Map(
    (previousTop20 ?? []).map((row) => [row.title, row.rank])
  );
  const movers = top20
    .map((row) => {
      const prev = previousRankByTitle.get(row.title);
      if (prev == null) return { ...row, delta: null, movement: "new" };
      return {
        ...row,
        previous_rank: prev,
        delta: prev - row.rank,
        movement: prev - row.rank > 0 ? "up" : prev - row.rank < 0 ? "down" : "same",
      };
    })
    .filter((row) => row.movement !== "same");

  const cores = await loadTasteCores(profile.id);
  const missingVisualWorld = liveActionFilms.filter(
    (film) => !(film.visual_world_tags ?? []).length
  );
  const missingStorytelling = liveActionFilms.filter(
    (film) => !(film.storytelling_tags ?? []).length
  );

  const visualWorldFreq = countFrequencies(liveActionFilms, "visual_world_tags");
  const storytellingFreq = countFrequencies(
    liveActionFilms,
    "storytelling_tags"
  );

  const highlightMarkup = HIGHLIGHT_TITLES.map((title) => {
    const film = findFilm(liveActionFilms, title);
    if (!film) return { title, found: false };
    return {
      title: film.title,
      found: true,
      moods: film.moods ?? [],
      visual_world_tags: film.visual_world_tags ?? [],
      storytelling_tags: film.storytelling_tags ?? [],
      aesthetic_tags_legacy: film.aesthetic_tags ?? [],
    };
  });

  const sampleMarkup = liveActionFilms
    .filter((film) => (film.visual_world_tags ?? []).length)
    .slice(0, 20)
    .map((film) => ({
      title: film.title,
      moods: film.moods ?? [],
      visual_world_tags: film.visual_world_tags ?? [],
      storytelling_tags: film.storytelling_tags ?? [],
    }));

  const report = {
    generated_at: new Date().toISOString(),
    profile: { id: profile.id, slug: profile.slug, name: profile.name },
    catalog: {
      live_action_count: liveActionFilms.length,
      rated_live_action_count: ratedLiveAction.length,
      missing_visual_world: missingVisualWorld.map((film) => film.title),
      missing_storytelling: missingStorytelling.map((film) => film.title),
    },
    frequencies: {
      visual_world: visualWorldFreq,
      storytelling: storytellingFreq,
      homogenization_flags: {
        visual_world_top_share: visualWorldFreq[0]?.share ?? 0,
        storytelling_top_share: storytellingFreq[0]?.share ?? 0,
        naturalism_heavy:
          (visualWorldFreq.find((row) => row.tag === "naturalistic")?.share ??
            0) >= 0.45,
        muted_heavy:
          (visualWorldFreq.find((row) => row.tag === "muted")?.share ?? 0) >=
          0.45,
        character_driven_heavy:
          (storytellingFreq.find((row) => row.tag === "character-driven")
            ?.share ?? 0) >= 0.45,
        slow_burn_heavy:
          (storytellingFreq.find((row) => row.tag === "slow-burn")?.share ??
            0) >= 0.45,
      },
    },
    taste_cores: cores,
    top20,
    movers_vs_previous_report: movers,
    highlight_markup: highlightMarkup,
    sample_markup_20: sampleMarkup,
    note:
      "Native live-action ranking is Mood × Visual World × Storytelling (equal thirds after per-axis min-max). Aesthetic/material retained on films but unused in native LA blend.",
    recomputed_row_count_unused: oldRows.length,
  };

  const outPath = path.join(
    process.cwd(),
    "tmp",
    `la-vw-st-review-${profile.slug}.json`
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`Wrote ${outPath}`);
  console.log(
    JSON.stringify(
      {
        live_action_count: report.catalog.live_action_count,
        missing_visual_world: report.catalog.missing_visual_world.length,
        missing_storytelling: report.catalog.missing_storytelling.length,
        top5: top20.slice(0, 5).map((row) => ({
          title: row.title,
          total: row.total_score,
          mood: row.mood_score,
          vw: row.visual_world_score,
          st: row.storytelling_score,
        })),
        homogenization: report.frequencies.homogenization_flags,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
