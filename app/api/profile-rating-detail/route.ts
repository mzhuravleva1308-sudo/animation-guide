import { NextResponse } from "next/server";
import { getUserDisplayEmail } from "@/lib/auth/user-display";
import {
  isValidFilmRatingDetail,
  type FilmRatingDetail,
} from "@/lib/rating-detail";
import { canAccessRatingDetail } from "@/lib/rating-detail-access.mjs";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ProfileRatingDetailRequest = {
  filmId?: string;
  visual?: number;
  mood?: number;
  plot?: number;
};

type ResolvedProfile =
  | { ok: true; admin: ReturnType<typeof getAdminSupabase>; profileId: string }
  | { ok: false; response: NextResponse };

async function resolveAllowlistedProfile(
  userId: string,
  email: string
): Promise<ResolvedProfile> {
  if (!canAccessRatingDetail(email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const admin = getAdminSupabase();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[profile-rating-detail] profile lookup failed:", profileError);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Could not resolve profile" },
        { status: 500 }
      ),
    };
  }

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "No profile found for this account",
          code: "profile_not_found",
        },
        { status: 404 }
      ),
    };
  }

  return { ok: true, admin, profileId: profile.id as string };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const resolved = await resolveAllowlistedProfile(
    user.id,
    getUserDisplayEmail(user)
  );
  if (!resolved.ok) {
    return resolved.response;
  }

  const { admin, profileId } = resolved;

  const { data, error } = await admin
    .from("film_rating_details")
    .select("film_id, visual_rating, mood_rating, plot_rating")
    .eq("profile_id", profileId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const details: Record<string, FilmRatingDetail> = {};
  for (const row of data ?? []) {
    details[row.film_id] = {
      visual: row.visual_rating,
      mood: row.mood_rating,
      plot: row.plot_rating,
    };
  }

  return NextResponse.json({ details });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: ProfileRatingDetailRequest;
  try {
    body = (await request.json()) as ProfileRatingDetailRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const detail = {
    visual: body.visual,
    mood: body.mood,
    plot: body.plot,
  };

  if (!body.filmId || !isValidFilmRatingDetail(detail)) {
    return NextResponse.json(
      { error: "Invalid rating detail request" },
      { status: 400 }
    );
  }

  const resolved = await resolveAllowlistedProfile(
    user.id,
    getUserDisplayEmail(user)
  );
  if (!resolved.ok) {
    return resolved.response;
  }

  const { admin, profileId } = resolved;

  const { data: ratingRow, error: ratingLookupError } = await admin
    .from("film_ratings")
    .select("film_id")
    .eq("profile_id", profileId)
    .eq("film_id", body.filmId)
    .maybeSingle();

  if (ratingLookupError) {
    return NextResponse.json(
      { error: ratingLookupError.message },
      { status: 500 }
    );
  }

  if (!ratingRow) {
    return NextResponse.json(
      { error: "Rate the film before saving detail scores" },
      { status: 400 }
    );
  }

  const { error } = await admin.from("film_rating_details").upsert(
    {
      film_id: body.filmId,
      profile_id: profileId,
      visual_rating: detail.visual,
      mood_rating: detail.mood,
      plot_rating: detail.plot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "film_id,profile_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, detail });
}
