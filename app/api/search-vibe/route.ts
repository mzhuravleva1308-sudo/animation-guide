import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireActingProfileId } from "@/lib/auth/acting-context";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { canAccessVibeSearch } from "@/lib/vibe-search-access.mjs";
import { MEDIA_TYPE, SCORE_MODE } from "@/lib/media-type.mjs";
import {
  applyPublicCatalogMediaTypeFilter,
  applyPublicCatalogVisibilityFilter,
} from "@/lib/public-catalog-films.mjs";
import { normalizeFilms } from "@/lib/normalize-film";
import { buildBalancedScores } from "@/lib/profile-film-scoring.mjs";
import { parseEmbedding } from "@/lib/per-like-catalog-ranking.mjs";
import {
  buildMoodEmbeddingInput,
  rankVibeByMoodEmbedding,
} from "@/lib/vibe-search.mjs";
import { normalizeVibeQueryToEnglish } from "@/lib/normalize-vibe-query.mjs";
import { VIBE_HIDDEN_LIST_TYPE } from "@/lib/vibe-hidden.mjs";
import type { Film } from "@/types/film";

export const runtime = "nodejs";

const MIN_QUERY_LENGTH = 4;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

const FILM_SELECT = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "poster_url",
  "image_url",
  "trailer_url",
  "availability",
  "synopsis",
  "what_it_is",
  "the_mood",
  "technique",
  "material_fact",
  "media_type",
  "moods",
  "aesthetic_tags",
  "narrative_tags",
].join(", ");

async function loadVisibleAnimationFilms(
  admin: ReturnType<typeof getAdminSupabase>
) {
  const films: Film[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await applyPublicCatalogMediaTypeFilter(
      applyPublicCatalogVisibilityFilter(
        admin.from("films").select(FILM_SELECT)
      ),
      MEDIA_TYPE.animation
    )
      .order("title")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;
    films.push(...normalizeFilms(data as Film[]));
    if (data.length < pageSize) break;
  }

  return films;
}

async function loadMoodEmbeddings(
  admin: ReturnType<typeof getAdminSupabase>,
  filmIds: string[]
) {
  const map = new Map<string, number[]>();

  for (let i = 0; i < filmIds.length; i += 200) {
    const chunk = filmIds.slice(i, i + 200);
    const { data, error } = await admin
      .from("film_mood_embeddings")
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

export async function GET(request: Request) {
  try {
    const resolved = await requireActingProfileId();
    if (!resolved.ok) {
      return NextResponse.json(
        {
          error:
            resolved.status === 404 ? "Profile required" : resolved.error,
        },
        { status: resolved.status === 404 ? 400 : resolved.status }
      );
    }

    if (!canAccessVibeSearch(resolved.sessionEmail)) {
      return NextResponse.json({ error: "Not available" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limitParam = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);

    if (query.length < MIN_QUERY_LENGTH) {
      return NextResponse.json({
        query,
        mode: "vibe",
        results: [],
        count: 0,
        message: `Enter at least ${MIN_QUERY_LENGTH} characters.`,
      });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "Search is temporarily unavailable" },
        { status: 503 }
      );
    }

    const { admin, profileId } = resolved;
    const films = await loadVisibleAnimationFilms(admin);
    const filmIds = films.map((film) => film.id);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const [
      moodEmbeddingByFilmId,
      ratingsResult,
      scoresResult,
      hiddenResult,
      normalized,
    ] = await Promise.all([
      loadMoodEmbeddings(admin, filmIds),
      admin
        .from("film_ratings")
        .select("film_id")
        .eq("profile_id", profileId),
      admin
        .from("profile_film_scores")
        .select(
          "film_id, emotional_score, material_score, visual_world_score, storytelling_score"
        )
        .eq("profile_id", profileId)
        .eq("score_mode", SCORE_MODE.native)
        .eq("source_media", MEDIA_TYPE.animation),
      admin
        .from("profile_film_lists")
        .select("film_id")
        .eq("profile_id", profileId)
        .eq("list_type", VIBE_HIDDEN_LIST_TYPE),
      normalizeVibeQueryToEnglish(openai, query),
    ]);

    if (ratingsResult.error) {
      return NextResponse.json(
        { error: ratingsResult.error.message },
        { status: 500 }
      );
    }
    if (scoresResult.error) {
      return NextResponse.json(
        { error: scoresResult.error.message },
        { status: 500 }
      );
    }
    if (hiddenResult.error) {
      return NextResponse.json(
        { error: hiddenResult.error.message },
        { status: 500 }
      );
    }

    const embedResponse = await openai.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: buildMoodEmbeddingInput(normalized.englishPhrase),
    });

    const queryEmbedding = embedResponse.data[0]?.embedding;
    if (!queryEmbedding?.length) {
      return NextResponse.json(
        { error: "Could not embed query" },
        { status: 500 }
      );
    }

    const rawById = new Map(
      (scoresResult.data ?? []).map((row) => [
        row.film_id,
        {
          emotional: row.emotional_score,
          material: row.material_score,
          visual_world: row.visual_world_score,
          storytelling: row.storytelling_score,
        },
      ])
    );
    const personalByFilmId = buildBalancedScores(films, rawById, {
      mediaType: MEDIA_TYPE.animation,
      scoreMode: SCORE_MODE.native,
    });

    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const excludedFilmIds = [
      ...(ratingsResult.data ?? []).map((row) => row.film_id),
      ...(hiddenResult.data ?? []).map((row) => row.film_id),
    ];

    const ranked = rankVibeByMoodEmbedding({
      films,
      queryEmbedding,
      moodEmbeddingByFilmId,
      personalByFilmId,
      ratedFilmIds: excludedFilmIds,
      limit,
    });

    return NextResponse.json({
      query,
      normalizedQuery: normalized.englishPhrase,
      translated: normalized.translated,
      mode: "vibe",
      results: ranked.map((row) => ({
        film: row.film,
        score: Number(row.combinedScore.toFixed(3)),
        vibeScore: Number(row.score.toFixed(3)),
        personalScore: Number(row.personalScore.toFixed(3)),
        moodSimilarity: Number(row.moodSimilarity.toFixed(3)),
        why: (row.film as Film).the_mood ?? null,
      })),
      count: ranked.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
