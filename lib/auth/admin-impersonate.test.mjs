import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildImpersonationCallbackPath } from "./admin-impersonate.mjs";

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
