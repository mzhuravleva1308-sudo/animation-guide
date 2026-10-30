import { after, NextResponse } from "next/server";
import { requireActingProfileId } from "@/lib/auth/acting-context";
import { logProfileActivity } from "@/lib/log-profile-activity";

type ProfileRatingRequest = {
  filmId?: string;
  rating?: number | null;
};

export async function POST(request: Request) {
  // Require an authenticated session. Token/slug/profileId from the client
  // are not accepted as proof of identity. Admin view-as uses the target profile.
  const resolved = await requireActingProfileId();
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, ...(resolved.code ? { code: resolved.code } : {}) },
      { status: resolved.status }
    );
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

  const { admin, profileId } = resolved;
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

    const { error: detailError } = await admin
      .from("film_rating_details")
      .delete()
      .eq("film_id", filmId)
      .eq("profile_id", profileId);

    if (detailError) {
      console.error(
        "[profile-rating] rating detail cleanup failed:",
        detailError
      );
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
