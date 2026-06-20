import {
  summarizeProductionBuildEnv,
  validateProductionBuildEnv,
} from "../lib/env/validate-production-build-env.mjs";

validateProductionBuildEnv(process.env);

if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_STACK_ENV !== "1") {
  console.log(
    "[build] Production env summary:",
    JSON.stringify(summarizeProductionBuildEnv(process.env), null, 2)
  );
}
