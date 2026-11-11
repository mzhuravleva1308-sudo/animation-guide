"use client";

import { useRef, type ReactNode } from "react";
import { captureAnalyticsEvent } from "@/lib/analytics";

type GuideFilmEngageTrackerProps = {
  filmId: string;
  filmTitle: string;
  guidePath: string;
  children: ReactNode;
};

/**
 * Fires once per mount when the visitor first interacts with a guide film card.
 */
export default function GuideFilmEngageTracker({
  filmId,
  filmTitle,
  guidePath,
  children,
}: GuideFilmEngageTrackerProps) {
  const capturedRef = useRef(false);

  return (
    <div
      onPointerDownCapture={() => {
        if (capturedRef.current) {
          return;
        }
        capturedRef.current = true;
        captureAnalyticsEvent("guide_film_clicked", {
          film_id: filmId,
          film_title: filmTitle,
          guide_path: guidePath,
        });
      }}
    >
      {children}
    </div>
  );
}
