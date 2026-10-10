import "server-only";

import { unstable_cache } from "next/cache";
import {
  freshTastePicksSinceIso,
  mergeRecentCatalogFilmIds,
} from "@/lib/fresh-taste-picks.mjs";
import { applyPublicCatalogVisibilityFilter } from "@/lib/public-catalog-films.mjs";
import { supabase } from "@/lib/supabase";
import { getAdminSupabase } from "@/lib/supabase/admin";

async function loadRecentFilmIdsFromCreatedAt(
  sinceIso: string
): Promise<string[]> {
  const { data, error } = await applyPublicCatalogVisibilityFilter(
    supabase.from("films").select("id").gte("created_at", sinceIso)
  );

  if (error) {
    console.error("[catalog] recent film created_at query failed", error);
    return [];
  }

  return ((data as { id?: string }[] | null) ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function loadRecentFilmIdsFromReleaseBatches(
  sinceIso: string
): Promise<string[]> {
  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from("film_release_batches")
      .select("film_ids")
      .gte("created_at", sinceIso);

    if (error) {
      console.error("[catalog] recent release batch query failed", error);
      return [];
    }

    const ids: string[] = [];
    for (const row of (data as { film_ids?: unknown }[] | null) ?? []) {
      if (!Array.isArray(row.film_ids)) continue;
      for (const id of row.film_ids) {
        if (typeof id === "string" && id) {
          ids.push(id);
        }
      }
    }
    return ids;
  } catch (error) {
    // Local/dev without service role still gets created_at fallback.
    console.warn("[catalog] recent release batch ids skipped", error);
    return [];
  }
}

async function loadRecentCatalogFilmIdsUncached(): Promise<string[]> {
  const sinceIso = freshTastePicksSinceIso();
  const [fromCreatedAt, fromBatches] = await Promise.all([
    loadRecentFilmIdsFromCreatedAt(sinceIso),
    loadRecentFilmIdsFromReleaseBatches(sinceIso),
  ]);
  return [...mergeRecentCatalogFilmIds(fromBatches, fromCreatedAt)];
}

function getCachedRecentCatalogFilmIdsLoader() {
  return unstable_cache(
    loadRecentCatalogFilmIdsUncached,
    ["recent-catalog-film-ids", "visible-or-go-live-30d-v1"],
    { revalidate: 120 }
  );
}

/**
 * Film ids that entered the public catalog within the fresh-picks window.
 * Union of direct-visible inserts (created_at) and go-live release batches.
 */
export async function loadRecentCatalogFilmIds(): Promise<Set<string>> {
  try {
    const ids = await getCachedRecentCatalogFilmIdsLoader()();
    return new Set(ids);
  } catch (error) {
    console.error("[catalog] recent film ids cache load failed", error);
    return new Set(await loadRecentCatalogFilmIdsUncached());
  }
}
