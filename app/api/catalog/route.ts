import { NextResponse } from "next/server";
import { loadPublicFilmCatalog } from "@/lib/load-public-film-catalog";
import { MEDIA_TYPE } from "@/lib/media-type";

export const dynamic = "force-dynamic";

/**
 * Lightweight catalog JSON for client-side Animation ↔ Films switching.
 * Avoids a full document SSR round-trip when toggling media tabs.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const media = searchParams.get("media");
    const sort = searchParams.get("sort");

    const catalog = await loadPublicFilmCatalog({ media, sort });

    if (
      media === MEDIA_TYPE.liveAction &&
      catalog.mediaType !== MEDIA_TYPE.liveAction
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      films: catalog.films,
      awardWinningFilmIds: catalog.awardWinningFilmIds,
      loadError: catalog.loadError,
      pageSize: catalog.pageSize,
      mediaType: catalog.mediaType,
      sortParam: catalog.sortParam,
      scoresLastComputedAt: catalog.scoresLastComputedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
