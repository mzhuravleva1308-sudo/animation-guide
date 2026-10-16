#!/usr/bin/env node
/**
 * Read-only vibe-search experiment against the public catalog.
 *
 *   APP_ENV=hosted node scripts/experiment-vibe-search.mjs "про добро и волшебство"
 *   APP_ENV=hosted node scripts/experiment-vibe-search.mjs --email=you@example.com "про добро и волшебство"
 */

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { MEDIA_TYPE, SCORE_MODE } from "../lib/media-type.mjs";
import { applyPublicCatalogVisibilityFilter } from "../lib/public-catalog-films.mjs";
import { parseEmbedding } from "../lib/per-like-catalog-ranking.mjs";
import { buildBalancedScores } from "../lib/profile-film-scoring.mjs";
import { searchFilms } from "../lib/film-search.mjs";
import {
  buildAestheticQueryText,
  buildMoodQueryText,
  detectSearchIntent,
  expandVibeTerms,
  rankPersonalizedVibe,
  searchVibeFilms,
} from "../lib/vibe-search.mjs";

applyAppEnv();

const FILM_SELECT = [
  "id",
  "title",
  "year",
  "the_mood",
  "what_it_is",
  "synopsis",
  "themes",
  "moods",
  "narrative_tags",
  "aesthetic_tags",
  "kid_safety",
  "media_type",
  "catalog_visible",
].join(", ");

function parseArgs(argv) {
  const emailArg = argv.find((arg) => arg.startsWith("--email="));
  const query = argv
    .filter((arg) => !arg.startsWith("--"))
    .join(" ")
    .trim();

  return {
    email: emailArg?.slice("--email=".length).trim() || "",
    query: query || "про добро и волшебство",
  };
}

async function findAuthUserByEmail(supabase, email) {
  const wanted = email.trim().toLowerCase();

  for (let page = 1; page <= 30; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === wanted);
    if (match) return match;
    if (users.length < 200) break;
  }

  return null;
}

async function loadProfileForEmail(supabase, email) {
  const user = await findAuthUserByEmail(supabase, email);
  if (!user) {
    throw new Error(`No auth user for ${email}`);
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, slug, name, user_id")
    .eq("user_id", user.id);

  if (error) throw error;
  if (!profiles?.length) {
    throw new Error(`No profile linked to ${email}`);
  }

  return { user, profile: profiles[0] };
}

async function loadRatings(supabase, profileId) {
  const { data, error } = await supabase
    .from("film_ratings")
    .select("film_id, rating")
    .eq("profile_id", profileId);

  if (error) throw error;
  return data ?? [];
}

async function loadPersonalScores(supabase, profileId, films) {
  const { data, error } = await supabase
    .from("profile_film_scores")
    .select(
      "film_id, emotional_score, material_score, visual_world_score, storytelling_score"
    )
    .eq("profile_id", profileId)
    .eq("score_mode", SCORE_MODE.native)
    .eq("source_media", MEDIA_TYPE.animation);

  if (error) throw error;

  const rawById = new Map(
    (data ?? []).map((row) => [
      row.film_id,
      {
        emotional: row.emotional_score,
        material: row.material_score,
        visual_world: row.visual_world_score,
        storytelling: row.storytelling_score,
      },
    ])
  );

  return buildBalancedScores(films, rawById, {
    mediaType: MEDIA_TYPE.animation,
    scoreMode: SCORE_MODE.native,
  });
}

async function loadVisibleAnimationFilms(supabase) {
  const films = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await applyPublicCatalogVisibilityFilter(
      supabase
        .from("films")
        .select(FILM_SELECT)
        .eq("media_type", MEDIA_TYPE.animation)
        .order("title")
        .range(from, from + pageSize - 1)
    );

    if (error) throw error;
    if (!data?.length) break;
    films.push(...data);
    if (data.length < pageSize) break;
  }

  return films;
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

async function embed(openai, text) {
  const response = await openai.embeddings.create({
    model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

function printResult(index, row, { personal = false } = {}) {
  const film = row.film;
  const mood = Number.isFinite(row.moodSimilarity)
    ? row.moodSimilarity.toFixed(3)
    : "—";
  const aesthetic = Number.isFinite(row.aestheticSimilarity)
    ? row.aestheticSimilarity.toFixed(3)
    : "—";
  const terms = (row.matchedTerms ?? []).slice(0, 8).join(", ") || "—";
  const moodLine = String(film.the_mood ?? "").slice(0, 110);
  const personalBit = personal
    ? `  combined=${row.combinedScore.toFixed(3)}  taste=${Number(row.personalScore ?? 0).toFixed(3)}  vibe=${row.score.toFixed(3)}`
    : `  score=${row.score.toFixed(3)}`;
  console.log(
    `${String(index + 1).padStart(2, " ")}. ${film.title} (${film.year ?? "?"})${personalBit}  mood=${mood}  look=${aesthetic}  lex=${Number(row.lexicalScore ?? 0).toFixed(2)}`
  );
  console.log(`    matched: ${terms}`);
  if (moodLine) {
    console.log(`    the_mood: ${moodLine}`);
  }
}

async function main() {
  const { email, query } = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase env");
  }
  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const openai = new OpenAI({ apiKey: openaiApiKey });
  const films = await loadVisibleAnimationFilms(supabase);
  const ids = films.map((film) => film.id);
  const terms = expandVibeTerms(query);
  const moodText = buildMoodQueryText(terms);
  const aestheticText = buildAestheticQueryText(terms);

  const [moodEmbeddingByFilmId, aestheticEmbeddingByFilmId, queryMoodEmbedding, queryAestheticEmbedding] =
    await Promise.all([
      loadEmbeddings(supabase, "film_mood_embeddings", ids),
      loadEmbeddings(supabase, "film_aesthetic_embeddings", ids),
      embed(openai, moodText),
      embed(openai, aestheticText),
    ]);

  const vibePool = searchVibeFilms(films, query, {
    limit: 80,
    moodEmbeddingByFilmId,
    aestheticEmbeddingByFilmId,
    queryMoodEmbedding,
    queryAestheticEmbedding,
  });
  const vibeResults = vibePool.slice(0, 12);

  const lexicalResults = searchFilms(films, query, { limit: 8 });

  console.log(`Catalog: ${process.env.APP_ENV ?? "development"}`);
  console.log(`Visible animation films: ${films.length}`);
  console.log(`Query: ${query}`);
  console.log(`Intent: ${detectSearchIntent(query)}`);
  console.log(`Expanded terms: ${terms.join(", ")}`);
  console.log(`Mood embed text: ${moodText}`);
  console.log(`Aesthetic embed text: ${aestheticText}`);
  console.log(
    `Embeddings: mood ${moodEmbeddingByFilmId.size}, aesthetic ${aestheticEmbeddingByFilmId.size}`
  );

  console.log("\n=== Current lexical searchFilms ===");
  if (!lexicalResults.length) {
    console.log("(no hits)");
  } else {
    for (const [index, row] of lexicalResults.entries()) {
      console.log(
        `${index + 1}. ${row.film.title}  score=${row.score.toFixed(2)}  fields=${row.matchedFields.join(",")}`
      );
    }
  }

  console.log("\n=== Vibe hybrid, not personalized ===");
  if (!vibeResults.length) {
    console.log("(no hits)");
  } else {
    vibeResults.forEach((row, index) => printResult(index, row));
  }

  if (!email) {
    console.log("\n(no --email: skipped personal ranking)");
    return;
  }

  const { profile } = await loadProfileForEmail(supabase, email);
  const ratings = await loadRatings(supabase, profile.id);
  const personalByFilmId = await loadPersonalScores(supabase, profile.id, films);
  const filmById = new Map(films.map((film) => [film.id, film]));
  const likes = ratings
    .filter((row) => Number(row.rating) >= 7)
    .map((row) => ({
      title: filmById.get(row.film_id)?.title ?? row.film_id,
      rating: row.rating,
    }))
    .sort(
      (a, b) =>
        Number(b.rating) - Number(a.rating) || a.title.localeCompare(b.title)
    );

  const personalized = rankPersonalizedVibe(vibePool, personalByFilmId, {
    limit: 12,
    ratedFilmIds: ratings.map((row) => row.film_id),
  });

  console.log(
    `\nProfile: ${profile.slug} (${profile.name ?? "unnamed"})  ratings=${ratings.length}  likes>=7=${likes.length}  scores=${personalByFilmId.size}`
  );
  console.log("Top likes:");
  for (const like of likes.slice(0, 12)) {
    console.log(`  ${like.rating}  ${like.title}`);
  }

  console.log("\n=== Personalized vibe (55% query + 45% your catalog taste) ===");
  console.log("(already rated titles excluded)");
  if (!personalized.length) {
    console.log("(no hits)");
  } else {
    personalized.forEach((row, index) =>
      printResult(index, row, { personal: true })
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
