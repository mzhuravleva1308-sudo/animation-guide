import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Keys owned by committed local-stack files — never overridden from .env.local in dev/e2e. */
export const LOCAL_STACK_ENV_KEYS = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MAILPIT_URL",
]);

function readEnvFile(filename, root = REPO_ROOT) {
  const filePath = path.join(root, filename);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return dotenv.parse(fs.readFileSync(filePath));
}

function mergeFileEnv(target, filename, root = REPO_ROOT) {
  Object.assign(target, readEnvFile(filename, root));
}

const E2E_ENV_KEYS = new Set(["E2E_PROFILE_SLUG", "E2E_PROFILE_TOKEN"]);

const ENV_FILES = {
  development: [".env.development"],
  e2e: [".env.development", ".env.e2e"],
  hosted: [".env.hosted.local"],
};

/**
 * @param {{ mode?: "development" | "e2e" | "hosted"; root?: string }} [options]
 * @returns {Record<string, string | undefined>}
 */
export function loadAppEnv(options = {}) {
  const root = options.root ?? REPO_ROOT;
  const mode =
    options.mode ??
    (process.env.APP_ENV === "hosted" ? "hosted" : "development");

  const merged = {};

  for (const file of ENV_FILES[mode] ?? ENV_FILES.development) {
    mergeFileEnv(merged, file, root);
  }

  const localSecrets = readEnvFile(".env.local", root);
  const blockLocalStackOverrides = mode === "development" || mode === "e2e";

  for (const [key, value] of Object.entries(localSecrets)) {
    if (mode === "e2e" && E2E_ENV_KEYS.has(key)) {
      continue;
    }
    if (blockLocalStackOverrides && LOCAL_STACK_ENV_KEYS.has(key)) {
      continue;
    }
    merged[key] = value;
  }

  return { ...process.env, ...merged };
}

/**
 * @param {{ mode?: "development" | "e2e" | "hosted" }} [options]
 */
export function applyAppEnv(options = {}) {
  const env = loadAppEnv(options);
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
  return env;
}

export function hostedSupabaseKeysInLocalEnv(root = REPO_ROOT) {
  const local = readEnvFile(".env.local", root);
  const url = local.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    return [];
  }
  if (!url.includes("127.0.0.1:54321") && !url.includes("localhost:54321")) {
    return ["NEXT_PUBLIC_SUPABASE_URL"];
  }
  return [];
}
