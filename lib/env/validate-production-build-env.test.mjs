import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  listForbiddenLocalProductionEnvKeys,
  summarizeProductionBuildEnv,
  validateProductionBuildEnv,
} from "./validate-production-build-env.mjs";

describe("validateProductionBuildEnv", () => {
  it("allows local stack values only when ALLOW_LOCAL_STACK_ENV=1", () => {
    assert.doesNotThrow(() =>
      validateProductionBuildEnv({
        NODE_ENV: "production",
        ALLOW_LOCAL_STACK_ENV: "1",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100",
      })
    );
  });

  it("fails production builds that omit hosted env", () => {
    assert.throws(
      () =>
        validateProductionBuildEnv({
          NODE_ENV: "production",
        }),
      /missing required environment variables/i
    );
  });

  it("forbids localhost Supabase and site URLs in production", () => {
    assert.throws(
      () =>
        validateProductionBuildEnv({
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
          NEXT_PUBLIC_SITE_URL: "https://animationpre.example",
        }),
      /cannot use local-only values/i
    );

    assert.throws(
      () =>
        validateProductionBuildEnv({
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
          NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
        }),
      /cannot use local-only values/i
    );
  });

  it("requires https for hosted production URLs", () => {
    assert.throws(
      () =>
        validateProductionBuildEnv({
          NODE_ENV: "production",
          NEXT_PUBLIC_SUPABASE_URL: "http://project.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
          NEXT_PUBLIC_SITE_URL: "https://animationpre.example",
        }),
      /NEXT_PUBLIC_SUPABASE_URL to use https/i
    );
  });

  it("summarizes env without exposing secrets", () => {
    const summary = summarizeProductionBuildEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "super-secret-anon-key",
      NEXT_PUBLIC_SITE_URL: "https://animationpre.example",
    });

    assert.equal(summary.supabaseOrigin, "https://project.supabase.co");
    assert.equal(summary.siteOrigin, "https://animationpre.example");
    assert.equal(summary.hasAnonKey, true);
    assert.equal(JSON.stringify(summary).includes("super-secret"), false);
  });

  it("detects forbidden local keys", () => {
    assert.deepEqual(
      listForbiddenLocalProductionEnvKeys({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SITE_URL: "https://example.com",
      }),
      ["NEXT_PUBLIC_SUPABASE_URL"]
    );
  });
});
