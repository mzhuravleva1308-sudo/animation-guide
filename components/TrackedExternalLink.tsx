"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import {
  captureAnalyticsEvent,
  type AnalyticsProperties,
} from "@/lib/analytics";

type TrackedExternalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  eventName: string;
  eventProperties?: AnalyticsProperties;
};

export default function TrackedExternalLink({
  eventName,
  eventProperties,
  onClick,
  children,
  ...anchorProps
}: TrackedExternalLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    captureAnalyticsEvent(eventName, {
      ...eventProperties,
      source_path: window.location.pathname,
    });
    onClick?.(event);
  }

  return (
    <a {...anchorProps} onClick={handleClick}>
      {children}
    </a>
  );
}
