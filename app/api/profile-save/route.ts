import { after, NextResponse } from "next/server";
import { logProfileActivity } from "@/lib/log-profile-activity";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";

type ProfileSaveRequest = {
  filmId?: string;
  saved?: boolean;
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

  // Resolve the profile server-side by the authenticated user's id only.
  const admin = getAdminSupabase();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[profile-save] profile lookup failed:", profileError);
    return NextResponse.json({ error: "Could not resolve profile" }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json(
      { error: "No profile found for this account", code: "profile_not_found" },
      { status: 404 }
    );
  }

  const profileId = profile.id;

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
