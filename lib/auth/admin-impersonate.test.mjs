import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildImpersonationCallbackPath } from "./admin-impersonate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("buildImpersonationCallbackPath", () => {
  it("builds callback URL with token_hash, type=email, and next", () => {
    const callbackPath = buildImpersonationCallbackPath("abc123", "/films");
    assert.equal(
      callbackPath,
      "/auth/callback?token_hash=abc123&type=email&next=%2Ffilms"
    );
  });

  it("defaults next to /", () => {
    const callbackPath = buildImpersonationCallbackPath("tok");
    assert.equal(
      callbackPath,
      "/auth/callback?token_hash=tok&type=email&next=%2F"
    );
  });

  it("rejects empty token", () => {
    assert.throws(() => buildImpersonationCallbackPath(""), /hashedToken/);
  });
});

describe("admin view-as route", () => {
  it("sets view-as cookie instead of swapping the supabase session", () => {
    const source = fs.readFileSync(
      path.join(root, "app/api/admin/view-as/route.ts"),
      "utf8"
    );
    assert.match(source, /VIEW_AS_USER_COOKIE_NAME/);
    assert.match(source, /requireAdminApiAccess/);
    assert.doesNotMatch(source, /verifyOtp/);
    assert.doesNotMatch(source, /generateLink/);
  });
});
