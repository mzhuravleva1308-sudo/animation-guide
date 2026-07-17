import { after, NextResponse } from "next/server";
import { logProfileActivity } from "@/lib/log-profile-activity";
import { getAdminSupabase } from "@/lib/supabase/admin";

type ProfileRatingRequest = {
  profileId?: string;
  filmId?: string;
  token?: string;
  rating?: number | null;
};

export async function POST(request: Request) {
  let body: ProfileRatingRequest;

  try {
    body = (await request.json()) as ProfileRatingRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { profileId, filmId, token, rating } = body;
  const validRating =
    rating === null ||
    (typeof rating === "number" &&
      Number.isInteger(rating) &&
      rating >= 1 &&
      rating <= 10);

  if (!profileId || !filmId || !token || !validRating) {
    return NextResponse.json({ error: "Invalid rating request" }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("share_token", token)
    .maybeSingle();

  if (profileError) {
    console.error("Profile rating authorization failed:", profileError);
    return NextResponse.json({ error: "Could not authorize profile" }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Invalid profile token" }, { status: 403 });
  }

  const eventType = rating === null ? "rating_removed" : "rating_set";
  const eventData = rating === null ? undefined : { rating };

  if (rating === null) {
    const { error } = await supabase
      .from("film_ratings")
      .delete()
      .eq("film_id", filmId)
      .eq("profile_id", profileId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("film_ratings").upsert(
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
