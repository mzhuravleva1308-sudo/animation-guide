import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

/**
 * Playwright E2E config — see TESTING.md for the full project testing convention.
 *
 * - npm test = full local verification (unit + e2e)
 * - webServer: production build && start on port 3100 (not next dev)
 * - Profile tests: E2E_PROFILE_SLUG + E2E_PROFILE_TOKEN only (.env.local)
 * - Email OTP tests: local Supabase + Mailpit (see TESTING.md)
 * - Reset: SUPABASE_SERVICE_ROLE_KEY — server-side cleanup only; never client, never commit
 */
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const e2ePort = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${e2ePort}`;
const skipWebServer = process.env.E2E_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
        command: `npm run build && npm run start -- -p ${e2ePort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
