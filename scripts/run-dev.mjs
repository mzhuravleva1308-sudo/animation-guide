import { spawn } from "node:child_process";
import {
  applyAppEnv,
  hostedSupabaseKeysInLocalEnv,
} from "./load-app-env.mjs";

const env = applyAppEnv({ mode: "development" });

const ignoredHostedKeys = hostedSupabaseKeysInLocalEnv();
if (ignoredHostedKeys.length > 0) {
  console.warn(
    `[dev] Ignoring hosted Supabase values in .env.local (${ignoredHostedKeys.join(", ")}). ` +
      "Local stack comes from .env.development. Move hosted keys to .env.hosted.local for scripts — see ENV.md."
  );
}

try {
  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok && response.status !== 401) {
    console.warn(
      `[dev] Local Supabase at ${env.NEXT_PUBLIC_SUPABASE_URL} returned HTTP ${response.status}. ` +
        "Run `npx supabase start` if you need auth or database features."
    );
  }
} catch {
  console.warn(
    `[dev] Local Supabase is not reachable at ${env.NEXT_PUBLIC_SUPABASE_URL}. ` +
      "Run `npx supabase start` for auth (Mailpit OTP) and seeded data."
  );
}

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", "--webpack"],
  {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
