import { after, NextResponse } from "next/server";
import { logProfileActivity } from "@/lib/log-profile-activity";
import { getAdminSupabase } from "@/lib/supabase/admin";

type ProfileSaveRequest = {
  profileId?: string;
  filmId?: string;
  token?: string;
  saved?: boolean;
};

export async function POST(request: Request) {
  let body: ProfileSaveRequest;

  try {
    body = (await request.json()) as ProfileSaveRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { profileId, filmId, token, saved } = body;

  if (!profileId || !filmId || !token || typeof saved !== "boolean") {
    return NextResponse.json({ error: "Invalid save request" }, { status: 400 });
  }

  const supabase = getAdminSupabase();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", profileId)
    .eq("share_token", token)
    .maybeSingle();

  if (profileError) {
    console.error("Profile save authorization failed:", profileError);
    return NextResponse.json({ error: "Could not authorize profile" }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json({ error: "Invalid profile token" }, { status: 403 });
  }

  if (saved) {
    const { data: existingItem, error: existingError } = await supabase
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
      const { error } = await supabase.from("profile_film_lists").insert({
        profile_id: profileId,
        film_id: filmId,
        list_type: "to_watch",
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  } else {
    const { error } = await supabase
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
