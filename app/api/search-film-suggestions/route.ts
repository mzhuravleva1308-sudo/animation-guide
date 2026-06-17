import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizeFilms } from "@/lib/normalize-film";
import {
  filmSearchSuggestionConstants,
  getSearchSuggestions,
} from "@/lib/film-search-suggestions.mjs";
import { isSearchQueryUsable } from "@/lib/film-search.mjs";
import type { Film } from "@/types/film";

const SUGGESTION_FILM_SELECT_FIELDS = [
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "technique",
  "moods",
  "aesthetic_tags",
  "narrative_tags",
].join(", ");

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const limitParam = Number(
      searchParams.get("limit") ??
        filmSearchSuggestionConstants.DEFAULT_SUGGESTION_LIMIT
    );

    if (!isSearchQueryUsable(query)) {
      return NextResponse.json({
        query,
        suggestions: [],
        message: "Enter at least 2 characters for suggestions.",
      });
    }

    const { data, error } = await supabase
      .from("films")
      .select(SUGGESTION_FILM_SELECT_FIELDS)
      .order("title");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const films = normalizeFilms((data as unknown as Film[] | null) ?? []);
    const limit = Number.isFinite(limitParam)
      ? Math.min(
          Math.max(limitParam, 1),
          filmSearchSuggestionConstants.MAX_SUGGESTION_LIMIT
        )
      : filmSearchSuggestionConstants.DEFAULT_SUGGESTION_LIMIT;

    const suggestions = getSearchSuggestions(films, query, { limit });

    return NextResponse.json({
      query,
      suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
