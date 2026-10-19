import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isClearingAllAuthTokenCookies,
  isSupabaseAuthTokenCookie,
} from "./cookie-options.mjs";

describe("supabase auth cookie helpers", () => {
  it("detects auth token cookie names including chunks", () => {
    assert.equal(isSupabaseAuthTokenCookie("sb-abc-auth-token"), true);
    assert.equal(isSupabaseAuthTokenCookie("sb-abc-auth-token.0"), true);
    assert.equal(
      isSupabaseAuthTokenCookie("sb-abc-auth-token-code-verifier"),
      false
    );
  });

  it("detects full session wipe vs chunk trim", () => {
    assert.equal(
      isClearingAllAuthTokenCookies([
        { name: "sb-abc-auth-token.0", value: "" },
        { name: "sb-abc-auth-token.1", value: "" },
      ]),
      true
    );

    assert.equal(
      isClearingAllAuthTokenCookies([
        { name: "sb-abc-auth-token.0", value: "rotated" },
        { name: "sb-abc-auth-token.1", value: "" },
      ]),
      false
    );

    assert.equal(
      isClearingAllAuthTokenCookies([{ name: "other", value: "" }]),
      false
    );
  });
});
