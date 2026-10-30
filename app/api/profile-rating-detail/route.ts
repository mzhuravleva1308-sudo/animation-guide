import { NextResponse } from "next/server";
import { requireActingProfileId } from "@/lib/auth/acting-context";
import {
  isValidFilmRatingDetail,
  type FilmRatingDetail,
} from "@/lib/rating-detail";
import { canAccessRatingDetail } from "@/lib/rating-detail-access.mjs";
import { getAdminSupabase } from "@/lib/supabase/admin";

type ProfileRatingDetailRequest = {
  filmId?: string;
  visual?: number;
  mood?: number;
  plot?: number;
};

type ResolvedProfile =
  | {
      ok: true;
      admin: ReturnType<typeof getAdminSupabase>;
      profileId: string;
    }
  | { ok: false; response: NextResponse };

async function resolveAllowlistedActingProfile(): Promise<ResolvedProfile> {
  const resolved = await requireActingProfileId();
  if (!resolved.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: resolved.error,
          ...(resolved.code ? { code: resolved.code } : {}),
        },
        { status: resolved.status }
      ),
    };
  }

  // Feature gate stays on the real session email so admin allowlists still work.
  if (!canAccessRatingDetail(resolved.sessionEmail)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    admin: resolved.admin,
    profileId: resolved.profileId,
  };
}

export async function GET() {
  const resolved = await resolveAllowlistedActingProfile();
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

  const resolved = await resolveAllowlistedActingProfile();
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
