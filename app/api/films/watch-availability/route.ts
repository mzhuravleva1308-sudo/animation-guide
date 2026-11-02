import { NextResponse } from "next/server";

/**
 * TMDB watch/providers refresh is disabled: store lists are often stale or wrong.
 * Keep showing the snapshot already on the film; enrich deep links separately.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "TMDB watch/providers refresh is disabled; existing watch_availability is used as-is",
      refreshed: false,
    },
    { status: 410 }
  );
}
