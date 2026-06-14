"use client";

import {
  ProfileActivityEventType,
  ProfileActivityLogInput,
} from "@/lib/profile-activity-types";

type ClientProfileActivityInput = Pick<
  ProfileActivityLogInput,
  "profileId" | "filmId" | "eventType" | "eventData"
>;

function sendProfileActivityLog(input: ClientProfileActivityInput) {
  void fetch("/api/profile-activity", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    keepalive: true,
  })
    .then(async (response) => {
      if (response.ok) {
        return;
      }

      const body = await response.text().catch(() => "");

      console.error("Profile activity log request failed:", {
        status: response.status,
        eventType: input.eventType,
        profileId: input.profileId,
        filmId: input.filmId ?? null,
        body,
      });
    })
    .catch((error) => {
      console.error("Profile activity log request failed:", {
        eventType: input.eventType,
        profileId: input.profileId,
        filmId: input.filmId ?? null,
        error,
      });
    });
}

export function logProfileActivityClient(input: ClientProfileActivityInput) {
  if (typeof window === "undefined") {
    return;
  }

  window.setTimeout(() => {
    sendProfileActivityLog(input);
  }, 0);
}

export type { ProfileActivityEventType };
