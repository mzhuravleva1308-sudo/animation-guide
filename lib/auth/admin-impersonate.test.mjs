import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildImpersonationCallbackPath } from "./admin-impersonate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("buildImpersonationCallbackPath", () => {
  it("builds callback URL with token_hash, type=email, and next", () => {
    const path = buildImpersonationCallbackPath("abc123", "/films");
    assert.equal(
      path,
      "/auth/callback?token_hash=abc123&type=email&next=%2Ffilms"
    );
  });

  it("defaults next to /", () => {
    const path = buildImpersonationCallbackPath("tok");
    assert.equal(path, "/auth/callback?token_hash=tok&type=email&next=%2F");
  });

  it("rejects empty token", () => {
    assert.throws(() => buildImpersonationCallbackPath(""), /hashedToken/);
  });
});

describe("admin impersonate route", () => {
  it("switches session in-route and does not bounce through /auth/callback", () => {
    const source = fs.readFileSync(
      path.join(root, "app/api/admin/impersonate/route.ts"),
      "utf8"
    );
    assert.match(source, /verifyOtp/);
    assert.match(source, /createCallbackClient/);
    assert.match(source, /PENDING_FILM_ACTION_COOKIE_NAME/);
    assert.doesNotMatch(source, /buildImpersonationCallbackPath/);
    assert.doesNotMatch(source, /redirect\(new URL\(`?\$\{?.*auth\/callback/);
    assert.ok(
      !source.includes('"/auth/callback"') &&
        !source.includes("'/auth/callback'"),
      "must not redirect the browser to /auth/callback"
    );
  });
});
