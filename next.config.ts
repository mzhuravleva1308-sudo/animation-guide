import type { NextConfig } from "next";
import { validateProductionBuildEnv } from "./lib/env/validate-production-build-env.mjs";

validateProductionBuildEnv(process.env);

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
