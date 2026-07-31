import { after, NextResponse } from "next/server";
import { logProfileActivity } from "@/lib/log-profile-activity";
import { ProfileActivityEventType } from "@/lib/profile-activity-types";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";

const CLIENT_EVENT_TYPES = new Set<ProfileActivityEventType>([
  "rating_set",
  "rating_removed",
  "film_saved",
  "film_unsaved",
  "film_watched",
  "film_unwatched",
]);

type ActivityRequestBody = {
  profileId?: string;
  filmId?: string | null;
  eventType?: string;
  eventData?: Record<string, unknown>;
};

export async function POST(request: Request) {
  // Require an authenticated session. Client-supplied profileId is never
  // used as identity — resolve the profile from the session user only.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: ActivityRequestBody;

  try {
    body = (await request.json()) as ActivityRequestBody;
  } catch (error) {
    console.error("Profile activity log request parse failed:", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { filmId, eventType, eventData } = body;

  if (
    !eventType ||
    !CLIENT_EVENT_TYPES.has(eventType as ProfileActivityEventType)
  ) {
    console.error("Profile activity log request rejected:", {
      eventType,
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[profile-activity] profile lookup failed:", profileError);
    return NextResponse.json({ error: "Could not resolve profile" }, { status: 500 });
  }

  if (!profile) {
    return NextResponse.json(
      { error: "No profile found for this account", code: "profile_not_found" },
      { status: 404 }
    );
  }

  const logInput = {
    profileId: profile.id,
    filmId: filmId ?? null,
    eventType: eventType as ProfileActivityEventType,
    eventData,
    userAgent: request.headers.get("user-agent"),
    referrer: request.headers.get("referer"),
  };

  after(async () => {
    await logProfileActivity(logInput);
  });

  return new NextResponse(null, { status: 204 });
}
