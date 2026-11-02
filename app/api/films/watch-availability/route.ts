import { NextResponse } from "next/server";
import { refreshFilmWatchAvailability } from "@/lib/refresh-film-watch-availability.mjs";
import { getAdminSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const filmId = typeof body.filmId === "string" ? body.filmId.trim() : "";
    if (!filmId) {
      return NextResponse.json({ error: "filmId is required" }, { status: 400 });
    }

    const tmdbApiKey =
      process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || "";
    if (!tmdbApiKey) {
      return NextResponse.json(
        { error: "TMDB is not configured" },
        { status: 500 }
      );
    }

    const result = await refreshFilmWatchAvailability({
      admin: getAdminSupabase(),
      filmId,
      tmdbApiKey,
      force: Boolean(body.force),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          watch_availability: result.watch_availability ?? null,
        },
        { status: result.status }
      );
    }

    return NextResponse.json({
      refreshed: result.refreshed,
      watch_availability: result.watch_availability,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Watch refresh failed",
      },
      { status: 500 }
    );
  }
}
