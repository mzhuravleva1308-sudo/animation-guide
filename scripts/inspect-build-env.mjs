import { summarizeProductionBuildEnv } from "../lib/env/validate-production-build-env.mjs";

const summary = summarizeProductionBuildEnv(process.env);

console.log(JSON.stringify(summary, null, 2));
