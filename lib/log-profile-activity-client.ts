"use client";

import {
  ProfileActivityEventType,
  ProfileActivityLogInput,
} from "@/lib/profile-activity-types";

type ClientProfileActivityInput = Pick<
  ProfileActivityLogInput,
  "profileId" | "filmId" | "eventType" | "eventData"
>;

export function logProfileActivityClient(input: ClientProfileActivityInput) {
  void fetch("/api/profile-activity", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {});
}

export type { ProfileActivityEventType };
