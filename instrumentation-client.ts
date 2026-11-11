import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
const apiHost =
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://eu.i.posthog.com";

/**
 * Cookieless product analytics (no consent banner).
 * Enable "Cookieless / server hash" in the PostHog project settings or events are dropped.
 * Do not call identify() — person_profiles: never keeps that a no-op.
 */
if (token) {
  posthog.init(token, {
    api_host: apiHost,
    defaults: "2026-08-30",
    cookieless_mode: "always",
    person_profiles: "never",
    disable_session_recording: true,
  });
}
