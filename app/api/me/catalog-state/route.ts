import { NextResponse } from "next/server";
import { getActingAuthContext } from "@/lib/auth/acting-context";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function toEpochMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Acting profile + film state for the catalog client.
 * Honors admin view-as (service role reads) so RLS never shows the admin's lists.
 */
export async function GET() {
  let context;
  try {
    context = await getActingAuthContext();
  } catch (error) {
    console.error("[me/catalog-state] acting context failed", error);
    return NextResponse.json({ error: "Could not resolve session" }, { status: 500 });
  }

  if (!context) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const profile = context.actingProfile;
  if (!profile) {
    return NextResponse.json({
      email: context.sessionEmail,
      viewAs: context.isViewAs
        ? { userId: context.actingUserId, email: context.actingEmail }
        : null,
      profile: null,
      savedFilmIds: [],
      filmRatings: {},
      ratingUpdatedAtMs: {},
      savedAtMs: {},
      tasteProfile: null,
      tasteProfileUpdatedAt: null,
    });
  }

  const admin = getAdminSupabase();
  const [profileRow, ratingsResult, savedResult] = await Promise.all([
    admin
      .from("profiles")
      .select("taste_profile, taste_profile_updated_at")
      .eq("id", profile.id)
      .maybeSingle(),
    admin
      .from("film_ratings")
      .select("film_id, rating, updated_at")
      .eq("profile_id", profile.id),
    admin
      .from("profile_film_lists")
      .select("film_id, created_at")
      .eq("profile_id", profile.id)
      .eq("list_type", "to_watch"),
  ]);

  const filmRatings: Record<string, number> = {};
  const ratingUpdatedAtMs: Record<string, number> = {};
  for (const row of ratingsResult.data ?? []) {
    if (typeof row.rating === "number") {
      filmRatings[row.film_id] = row.rating;
      const ms = toEpochMs(row.updated_at);
      if (ms != null) ratingUpdatedAtMs[row.film_id] = ms;
    }
  }

  const savedFilmIds: string[] = [];
  const savedAtMs: Record<string, number> = {};
  for (const row of savedResult.data ?? []) {
    savedFilmIds.push(row.film_id);
    const ms = toEpochMs(row.created_at);
    if (ms != null) savedAtMs[row.film_id] = ms;
  }

  return NextResponse.json({
    email: context.sessionEmail,
    viewAs: context.isViewAs
      ? { userId: context.actingUserId, email: context.actingEmail }
      : null,
    profile: {
      profileId: profile.id,
      profileSlug: profile.slug,
      profileName: profile.name,
      tasteProfile: profileRow.data?.taste_profile ?? null,
      tasteProfileUpdatedAt: profileRow.data?.taste_profile_updated_at ?? null,
    },
    savedFilmIds,
    filmRatings,
    ratingUpdatedAtMs,
    savedAtMs,
  });
}
