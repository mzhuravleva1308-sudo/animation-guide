import { after, NextResponse } from "next/server";
import { requireActingProfileId } from "@/lib/auth/acting-context";
import { logProfileActivity } from "@/lib/log-profile-activity";

type ProfileSaveRequest = {
  filmId?: string;
  saved?: boolean;
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

  let body: ProfileSaveRequest;
  try {
    body = (await request.json()) as ProfileSaveRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { filmId, saved } = body;

  if (!filmId || typeof saved !== "boolean") {
    return NextResponse.json({ error: "Invalid save request" }, { status: 400 });
  }

  const { admin, profileId } = resolved;

  if (saved) {
    const { data: existingItem, error: existingError } = await admin
      .from("profile_film_lists")
      .select("id")
      .eq("profile_id", profileId)
      .eq("film_id", filmId)
      .eq("list_type", "to_watch")
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (!existingItem) {
      const { error } = await admin.from("profile_film_lists").insert({
        profile_id: profileId,
        film_id: filmId,
        list_type: "to_watch",
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  } else {
    const { error } = await admin
      .from("profile_film_lists")
      .delete()
      .eq("profile_id", profileId)
      .eq("film_id", filmId)
      .eq("list_type", "to_watch");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  after(async () => {
    await logProfileActivity({
      profileId,
      filmId,
      eventType: saved ? "film_saved" : "film_unsaved",
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
    });
  });

  return NextResponse.json({ ok: true });
}
