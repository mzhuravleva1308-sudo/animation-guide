import { after, NextResponse } from "next/server";
import { requireActingProfileId } from "@/lib/auth/acting-context";
import { logProfileActivity } from "@/lib/log-profile-activity";
import { ProfileActivityEventType } from "@/lib/profile-activity-types";

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
  // used as identity — resolve the acting profile (honors admin view-as).
  const resolved = await requireActingProfileId();
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, ...(resolved.code ? { code: resolved.code } : {}) },
      { status: resolved.status }
    );
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

  const logInput = {
    profileId: resolved.profileId,
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
