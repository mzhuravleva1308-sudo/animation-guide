import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeEmailOtpType,
  resolveCallbackMethod,
} from "./callback-params.mjs";

describe("resolveCallbackMethod", () => {
  it("prefers token_hash verifyOtp flow for magic links", () => {
    const params = new URLSearchParams({
      token_hash: "abc123",
      type: "magiclink",
    });

    assert.deepEqual(resolveCallbackMethod(params), {
      method: "verify_otp",
      tokenHash: "abc123",
      otpType: "magiclink",
    });
  });

  it("falls back to PKCE code exchange when only code is present", () => {
    const params = new URLSearchParams({
      code: "pkce-code",
    });

    assert.deepEqual(resolveCallbackMethod(params), {
      method: "exchange_code",
      code: "pkce-code",
    });
  });

  it("prefers verifyOtp when both token_hash and code are present", () => {
    const params = new URLSearchParams({
      token_hash: "abc123",
      type: "magiclink",
      code: "pkce-code",
    });

    assert.deepEqual(resolveCallbackMethod(params), {
      method: "verify_otp",
      tokenHash: "abc123",
      otpType: "magiclink",
    });
  });

  it("returns missing when no supported callback params are present", () => {
    assert.deepEqual(
      resolveCallbackMethod(new URLSearchParams()),
      { method: "missing" }
    );
  });
});

describe("normalizeEmailOtpType", () => {
  it("accepts supported email OTP types", () => {
    assert.equal(normalizeEmailOtpType("magiclink"), "magiclink");
    assert.equal(normalizeEmailOtpType("EMAIL"), "email");
  });

  it("rejects unsupported OTP types", () => {
    assert.equal(normalizeEmailOtpType("oauth"), null);
    assert.equal(normalizeEmailOtpType(""), null);
  });
});
