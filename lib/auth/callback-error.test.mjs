import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAuthCallbackError } from "./callback-error.mjs";

describe("formatAuthCallbackError", () => {
  it("explains expired OTP links clearly", () => {
    assert.match(
      formatAuthCallbackError({
        code: "otp_expired",
        message: "OTP expired",
      }),
      /expired/i
    );
  });

  it("explains expired links clearly", () => {
    assert.match(
      formatAuthCallbackError({
        code: "flow_state_expired",
        message: "Flow state expired",
      }),
      /expired/i
    );
  });

  it("mentions template upgrade for legacy PKCE-only links", () => {
    assert.match(
      formatAuthCallbackError({
        code: "pkce_code_verifier_not_found",
        message: "PKCE code verifier not found",
      }),
      /email template/i
    );
  });

  it("includes the Supabase error code in the fallback message", () => {
    assert.match(
      formatAuthCallbackError({
        code: "unexpected_failure",
        message: "Something went wrong",
      }),
      /unexpected_failure/
    );
  });
});
