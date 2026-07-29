import { after, NextResponse } from "next/server";
import { logProfileActivity } from "@/lib/log-profile-activity";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";

type ProfileRatingRequest = {
  filmId?: string;
  rating?: number | null;
};

export async function POST(request: Request) {
  // Require an authenticated session. Token/slug/profileId from the client
  // are not accepted as proof of identity.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: ProfileRatingRequest;
  try {
    body = (await request.json()) as ProfileRatingRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { filmId, rating } = body;
  const validRating =
    rating === null ||
    (typeof rating === "number" &&
      Number.isInteger(rating) &&
      rating >= 1 &&
      rating <= 10);

  if (!filmId || !validRating) {
    return NextResponse.json({ error: "Invalid rating request" }, { status: 400 });
  }

  // Resolve the profile server-side by the authenticated user's id only.
  const admin = getAdminSupabase();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[profile-rating] profile lookup failed:", profileError);
    return NextResponse.json({ error: "Could not resolve profile" }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json(
      { error: "No profile found for this account", code: "profile_not_found" },
      { status: 404 }
    );
  }

  const profileId = profile.id;
  const eventType = rating === null ? "rating_removed" : "rating_set";
  const eventData = rating === null ? undefined : { rating };

  if (rating === null) {
    const { error } = await admin
      .from("film_ratings")
      .delete()
      .eq("film_id", filmId)
      .eq("profile_id", profileId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await admin.from("film_ratings").upsert(
      {
        film_id: filmId,
        profile_id: profileId,
        rating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "film_id,profile_id" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  after(async () => {
    await logProfileActivity({
      profileId,
      filmId,
      eventType,
      eventData,
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
    });

    if (rating !== null) {
      await logProfileActivity({
        profileId,
        filmId,
        eventType: "film_watched",
        eventData: { rating },
        userAgent: request.headers.get("user-agent"),
        referrer: request.headers.get("referer"),
      });
    } else {
      await logProfileActivity({
        profileId,
        filmId,
        eventType: "film_unwatched",
        userAgent: request.headers.get("user-agent"),
        referrer: request.headers.get("referer"),
      });
    }
  });

  return NextResponse.json({ ok: true });
}
