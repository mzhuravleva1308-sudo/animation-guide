import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LOCAL_STACK_ENV_KEYS,
  hostedSupabaseKeysInLocalEnv,
  loadAppEnv,
} from "../scripts/load-app-env.mjs";

test("LOCAL_STACK_ENV_KEYS includes Supabase and Mailpit", () => {
  assert.ok(LOCAL_STACK_ENV_KEYS.has("NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(LOCAL_STACK_ENV_KEYS.has("MAILPIT_URL"));
});

test("loadAppEnv development ignores hosted Supabase keys from .env.local", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-app-env-"));

  fs.writeFileSync(
    path.join(dir, ".env.development"),
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=local-anon\n"
  );
  fs.writeFileSync(
    path.join(dir, ".env.local"),
    [
      "NEXT_PUBLIC_SUPABASE_URL=https://hosted.supabase.co",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=hosted-anon",
      "OPENAI_API_KEY=sk-test",
    ].join("\n")
  );

  const env = loadAppEnv({ mode: "development", root: dir });
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "local-anon");
  assert.equal(env.OPENAI_API_KEY, "sk-test");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("loadAppEnv e2e layers .env.e2e after .env.development", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-app-env-"));

  fs.writeFileSync(
    path.join(dir, ".env.development"),
    "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000\n"
  );
  fs.writeFileSync(
    path.join(dir, ".env.e2e"),
    "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3100\n"
  );

  const env = loadAppEnv({ mode: "e2e", root: dir });
  assert.equal(env.NEXT_PUBLIC_SITE_URL, "http://127.0.0.1:3100");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("hostedSupabaseKeysInLocalEnv detects non-local URLs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-app-env-"));

  fs.writeFileSync(
    path.join(dir, ".env.local"),
    "NEXT_PUBLIC_SUPABASE_URL=https://hosted.supabase.co\n"
  );
  assert.deepEqual(hostedSupabaseKeysInLocalEnv(dir), [
    "NEXT_PUBLIC_SUPABASE_URL",
  ]);

  fs.rmSync(dir, { recursive: true, force: true });
});
