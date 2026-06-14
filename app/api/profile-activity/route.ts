import { NextResponse } from "next/server";
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
  let body: ActivityRequestBody;

  try {
    body = (await request.json()) as ActivityRequestBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { profileId, filmId, eventType, eventData } = body;

  if (!profileId || !eventType || !CLIENT_EVENT_TYPES.has(eventType as ProfileActivityEventType)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  void logProfileActivity({
    profileId,
    filmId: filmId ?? null,
    eventType: eventType as ProfileActivityEventType,
    eventData,
    userAgent: request.headers.get("user-agent"),
    referrer: request.headers.get("referer"),
  });

  return NextResponse.json({ ok: true });
}
