import posthog from "posthog-js";

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

function hasPostHogToken(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim());
}

/**
 * Fire a custom PostHog event when the client SDK is configured.
 * Safe no-op without a project token (local/dev/E2E).
 */
export function captureAnalyticsEvent(
  event: string,
  properties?: AnalyticsProperties
): void {
  if (!hasPostHogToken() || typeof window === "undefined") {
    return;
  }

  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break product flows.
  }
}
