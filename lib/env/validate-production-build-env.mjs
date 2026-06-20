import { isLocalStackUrl, isLocalSupabaseUrl } from "./is-local-stack-url.mjs";

export const PRODUCTION_BUILD_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
];

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function listMissingProductionBuildEnvKeys(env) {
  return PRODUCTION_BUILD_ENV_KEYS.filter((key) => !env[key]?.trim());
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function listForbiddenLocalProductionEnvKeys(env) {
  /** @type {string[]} */
  const forbidden = [];

  if (isLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
    forbidden.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (isLocalStackUrl(env.NEXT_PUBLIC_SITE_URL)) {
    forbidden.push("NEXT_PUBLIC_SITE_URL");
  }

  return forbidden;
}

/**
 * @param {Record<string, string | undefined>} [env]
 */
export function validateProductionBuildEnv(env = process.env) {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (env.ALLOW_LOCAL_STACK_ENV === "1") {
    return;
  }

  const missing = listMissingProductionBuildEnvKeys(env);
  if (missing.length > 0) {
    throw new Error(
      `Production build is missing required environment variables: ${missing.join(", ")}. ` +
        "Set hosted Supabase and site URL in the deployment dashboard (Production and Preview). " +
        "Committed .env.development is for local dev/E2E only and is not loaded by Next.js production builds."
    );
  }

  const forbidden = listForbiddenLocalProductionEnvKeys(env);
  if (forbidden.length > 0) {
    throw new Error(
      `Production build cannot use local-only values for: ${forbidden.join(", ")}. ` +
        "Remove localhost/127.0.0.1 overrides from the hosting dashboard and rebuild. " +
        "See ENV.md for the Production checklist."
    );
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!supabaseUrl.startsWith("https://")) {
    throw new Error(
      "Production build requires NEXT_PUBLIC_SUPABASE_URL to use https:// (hosted Supabase)."
    );
  }

  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  if (!siteUrl.startsWith("https://")) {
    throw new Error(
      "Production build requires NEXT_PUBLIC_SITE_URL to use https:// (your public site origin)."
    );
  }
}

/**
 * Safe summary for logs/CI — never prints secrets.
 *
 * @param {Record<string, string | undefined>} env
 */
export function summarizeProductionBuildEnv(env = process.env) {
  /** @param {string | undefined} value */
  function hostOf(value) {
    if (!value?.trim()) {
      return null;
    }

    try {
      return new URL(value.trim()).origin;
    } catch {
      return "(invalid-url)";
    }
  }

  return {
    nodeEnv: env.NODE_ENV ?? null,
    allowLocalStackEnv: env.ALLOW_LOCAL_STACK_ENV ?? null,
    vercelEnv: env.VERCEL_ENV ?? null,
    supabaseOrigin: hostOf(env.NEXT_PUBLIC_SUPABASE_URL),
    siteOrigin: hostOf(env.NEXT_PUBLIC_SITE_URL),
    hasAnonKey: Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
    hasServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    loadedFromCommittedDevelopmentEnv:
      "never when NODE_ENV=production (Next.js loads .env.production* and hosting env only)",
  };
}
