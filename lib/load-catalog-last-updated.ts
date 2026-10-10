import "server-only";

import { unstable_cache } from "next/cache";
import {
  formatCatalogUpdatedLabel,
  maxIsoTimestamps,
} from "@/lib/catalog-last-updated.mjs";
import { supabase } from "@/lib/supabase";
import { getAdminSupabase } from "@/lib/supabase/admin";

async function loadNewestVisibleFilmCreatedAt(): Promise<string | null> {
  const { data, error } = await supabase
    .from("films")
    .select("created_at")
    .eq("catalog_visible", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[catalog] last-updated film query failed", error);
    return null;
  }

  return typeof data?.created_at === "string" ? data.created_at : null;
}

async function loadNewestReleaseBatchCreatedAt(): Promise<string | null> {
  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from("film_release_batches")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[catalog] last-updated release batch query failed", error);
      return null;
    }

    return typeof data?.created_at === "string" ? data.created_at : null;
  } catch (error) {
    // Local/dev without service role still gets film-created_at fallback.
    console.warn("[catalog] last-updated release batch skipped", error);
    return null;
  }
}

async function loadCatalogLastUpdatedAtUncached(): Promise<string | null> {
  const [filmAt, batchAt] = await Promise.all([
    loadNewestVisibleFilmCreatedAt(),
    loadNewestReleaseBatchCreatedAt(),
  ]);
  return maxIsoTimestamps(filmAt, batchAt);
}

function getCachedCatalogLastUpdatedAtLoader() {
  return unstable_cache(
    loadCatalogLastUpdatedAtUncached,
    ["catalog-last-updated-at", "visible-film-or-go-live-v1"],
    { revalidate: 120 }
  );
}

/** Newest public catalog change as ISO, or null if unknown. */
export async function loadCatalogLastUpdatedAt(): Promise<string | null> {
  try {
    return await getCachedCatalogLastUpdatedAtLoader()();
  } catch (error) {
    console.error("[catalog] last-updated cache load failed", error);
    return loadCatalogLastUpdatedAtUncached();
  }
}

/** Label for public footer, e.g. "Catalog updated March 2026". */
export async function loadCatalogUpdatedLabel(): Promise<string | null> {
  return formatCatalogUpdatedLabel(await loadCatalogLastUpdatedAt());
}
