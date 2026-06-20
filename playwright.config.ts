import { defineConfig, devices } from "@playwright/test";
import { applyAppEnv, loadAppEnv } from "./scripts/load-app-env.mjs";

/**
 * Playwright E2E config — see TESTING.md for the full project testing convention.
 *
 * - npm test = full local verification (unit + e2e)
 * - webServer: production build && start on port 3100 (not next dev)
 * - Env: .env.development + .env.e2e + secrets from .env.local (see ENV.md)
 * - Magic-link auth tests: local Supabase + Mailpit (see TESTING.md)
 */
const appEnv = applyAppEnv({ mode: "e2e" });

const e2ePort = Number(appEnv.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${e2ePort}`;
const skipWebServer = appEnv.E2E_SKIP_WEBSERVER === "1";

function stringEnv(
  env: Record<string, string | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => {
      return entry[1] !== undefined;
    })
  );
}

const webServerEnv = stringEnv(loadAppEnv({ mode: "e2e" }));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!appEnv.CI,
  retries: appEnv.CI ? 2 : 0,
  workers: appEnv.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: "node scripts/run-e2e-webserver.mjs",
        url: baseURL,
        reuseExistingServer: !appEnv.CI,
        timeout: 180_000,
        env: webServerEnv,
      },
});
