import { createClient } from "@supabase/supabase-js";
import { loadAppEnv } from "../scripts/load-app-env.mjs";

/**
 * Supabase client for festival admin QA.
 * Defaults to hosted (.env.hosted.local) where discovery/backfill data lives.
 * Set FESTIVAL_ADMIN_SUPABASE_ENV=local to read from the local CLI stack instead.
 */
export function getFestivalAdminSupabase() {
  const preferLocal = process.env.FESTIVAL_ADMIN_SUPABASE_ENV === "local";
  const modes = preferLocal ? ["development", "hosted"] : ["hosted", "development"];

  for (const mode of modes) {
    const env = loadAppEnv({ mode });
    const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (url && key) {
      return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  throw new Error(
    "Festival admin requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
      "Configure .env.hosted.local for hosted QA data, or set FESTIVAL_ADMIN_SUPABASE_ENV=local."
  );
}
