import type { NextConfig } from "next";
import { validateProductionBuildEnv } from "./lib/env/validate-production-build-env.mjs";

validateProductionBuildEnv(process.env);

/** Scripts spawned via execFile from prep routes need their own node_modules on disk. */
const discoveryPrepTracingIncludes = [
  "./scripts/**/*",
  "./lib/**/*",
  "./node_modules/openai/**/*",
  "./node_modules/dotenv/**/*",
  "./node_modules/@supabase/supabase-js/**/*",
  "./node_modules/@supabase/ssr/**/*",
  "./node_modules/@supabase/realtime-js/**/*",
  "./node_modules/@supabase/storage-js/**/*",
  "./node_modules/@supabase/functions-js/**/*",
  "./node_modules/@supabase/postgrest-js/**/*",
  "./node_modules/@supabase/auth-js/**/*",
];

const nextConfig: NextConfig = {
  // Keep openai resolvable when prep spawns `node scripts/*.mjs` in the lambda.
  serverExternalPackages: ["openai"],
  // Film discovery Approve / Retry prep exec scripts/*.mjs as child processes.
  outputFileTracingIncludes: {
    "/api/admin/film-discovery/review": discoveryPrepTracingIncludes,
    "/api/admin/film-releases/process-prep": discoveryPrepTracingIncludes,
  },
};

export default nextConfig;
