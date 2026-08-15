import type { NextConfig } from "next";
import { validateProductionBuildEnv } from "./lib/env/validate-production-build-env.mjs";

validateProductionBuildEnv(process.env);

const nextConfig: NextConfig = {
  // Film discovery Approve runs process-film-batch helpers that exec scripts/*.mjs
  outputFileTracingIncludes: {
    "/api/admin/film-discovery/review": ["./scripts/**/*", "./lib/**/*"],
    "/api/admin/film-releases/process-prep": ["./scripts/**/*", "./lib/**/*"],
  },
};

export default nextConfig;
