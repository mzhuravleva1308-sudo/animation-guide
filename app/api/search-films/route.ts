import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizeFilms } from "@/lib/normalize-film";
import {
  filmSearchConstants,
  isSearchQueryUsable,
  searchFilms,
} from "@/lib/film-search.mjs";
import { MEDIA_TYPE } from "@/lib/media-type.mjs";
import {
  applyPublicCatalogMediaTypeFilter,
  applyPublicCatalogVisibilityFilter,
} from "@/lib/public-catalog-films.mjs";
import { loadArchivedFilmIdsForViewer } from "@/lib/load-archived-film-ids.mjs";
import type { Film } from "@/types/film";

const SEARCH_FILM_SELECT_FIELDS = [
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limitParam = Number(searchParams.get("limit") ?? filmSearchConstants.DEFAULT_LIMIT);

    if (!isSearchQueryUsable(query)) {
      return NextResponse.json({
        query,
        results: [],
        message: `Enter at least ${filmSearchConstants.MIN_QUERY_LENGTH} characters to search.`,
      });
    }

    const { data, error } = await applyPublicCatalogMediaTypeFilter(
      applyPublicCatalogVisibilityFilter(
        supabase.from("films").select(SEARCH_FILM_SELECT_FIELDS)
      ),
      MEDIA_TYPE.animation
    ).order("title");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const archivedIds = await loadArchivedFilmIdsForViewer();
    const films = normalizeFilms((data as unknown as Film[] | null) ?? []).filter(
      (film) => !archivedIds.has(film.id)
    );
    const limit = Number.isFinite(limitParam)
      ? Math.min(
          Math.max(limitParam, 1),
          filmSearchConstants.MAX_LIMIT
        )
      : filmSearchConstants.DEFAULT_LIMIT;

    const results = searchFilms(films, query, { limit }).map((result) => ({
      film: result.film,
      score: Number(result.score.toFixed(2)),
      matchedFields: result.matchedFields,
    }));

    return NextResponse.json({
      query,
      results,
      count: results.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
