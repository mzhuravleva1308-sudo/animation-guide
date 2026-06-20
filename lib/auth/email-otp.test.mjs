import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canResendEmailOtp,
  formatCodeSentMessage,
  formatExistingCodeMessage,
  formatEmailOtpError,
  formatResendCooldownMessage,
  getEmailOtpResendDelayMs,
  isCompleteOtpCode,
  isEmailOtpRateLimitError,
  isValidAuthEmail,
  maskAuthEmail,
  normalizeAuthEmail,
  normalizeOtpCode,
  resolveEmailOtpSendOutcome,
} from "./email-otp.mjs";

describe("normalizeAuthEmail", () => {
  it("trims and lowercases email addresses", () => {
    assert.equal(normalizeAuthEmail("  Maria@Example.COM  "), "maria@example.com");
  });
});

describe("isValidAuthEmail", () => {
  it("accepts well-formed emails", () => {
    assert.equal(isValidAuthEmail("viewer@example.com"), true);
  });

  it("rejects invalid emails", () => {
    assert.equal(isValidAuthEmail("not-an-email"), false);
    assert.equal(isValidAuthEmail("   "), false);
  });
});

describe("normalizeOtpCode", () => {
  it("keeps digits only and caps length at six", () => {
    assert.equal(normalizeOtpCode("12a34b56c78"), "123456");
    assert.equal(normalizeOtpCode("123"), "123");
  });
});

describe("isCompleteOtpCode", () => {
  it("requires exactly six digits", () => {
    assert.equal(isCompleteOtpCode("123456"), true);
    assert.equal(isCompleteOtpCode("12345"), false);
    assert.equal(isCompleteOtpCode("12-34-56"), true);
  });
});

describe("maskAuthEmail", () => {
  it("masks the local part while keeping the domain visible", () => {
    assert.equal(maskAuthEmail("maria@example.com"), "m••••@example.com");
  });
});

describe("formatCodeSentMessage", () => {
  it("uses neutral copy without account hints", () => {
    assert.equal(
      formatCodeSentMessage("maria@example.com"),
      "We sent a 6-digit code to m••••@example.com."
    );
  });
});

describe("formatExistingCodeMessage", () => {
  it("does not claim a new code was sent", () => {
    assert.match(
      formatExistingCodeMessage("maria@example.com"),
      /may already be waiting/i
    );
    assert.doesNotMatch(formatExistingCodeMessage("maria@example.com"), /We sent/i);
  });
});

describe("formatResendCooldownMessage", () => {
  it("allows entering an existing code while resend is blocked", () => {
    assert.match(formatResendCooldownMessage(), /wait before resending/i);
    assert.match(formatResendCooldownMessage(), /enter the code/i);
  });
});

describe("isEmailOtpRateLimitError", () => {
  it("detects provider rate-limit codes and messages", () => {
    assert.equal(
      isEmailOtpRateLimitError({ code: "over_email_send_rate_limit" }),
      true
    );
    assert.equal(
      isEmailOtpRateLimitError({
        message:
          "For security purposes, you can only request this once every 60 seconds",
      }),
      true
    );
    assert.equal(isEmailOtpRateLimitError({ status: 429 }), true);
    assert.equal(isEmailOtpRateLimitError({ code: "invalid_otp" }), false);
  });
});

describe("resolveEmailOtpSendOutcome", () => {
  it("classifies send results for UI transitions", () => {
    assert.equal(resolveEmailOtpSendOutcome(null), "success");
    assert.equal(
      resolveEmailOtpSendOutcome({ code: "over_email_send_rate_limit" }),
      "rate_limited"
    );
    assert.equal(resolveEmailOtpSendOutcome({ code: "unexpected_failure" }), "failed");
  });
});

describe("canResendEmailOtp", () => {
  it("blocks resends during the cooldown window", () => {
    const now = 1_000_000;
    const lastSentAt = now - 10_000;

    assert.equal(canResendEmailOtp(lastSentAt, now), false);
    assert.equal(canResendEmailOtp(lastSentAt - 30_000, now), true);
    assert.equal(canResendEmailOtp(null, now), true);
  });
});

describe("getEmailOtpResendDelayMs", () => {
  it("returns remaining cooldown time", () => {
    const now = 1_000_000;
    const lastSentAt = now - 10_000;

    assert.equal(getEmailOtpResendDelayMs(lastSentAt, now), 20_000);
    assert.equal(getEmailOtpResendDelayMs(null, now), 0);
  });
});

describe("formatEmailOtpError", () => {
  it("maps OTP failures to safe user-facing messages", () => {
    assert.match(formatEmailOtpError({ code: "invalid_otp" }), /incorrect/i);
    assert.match(formatEmailOtpError({ code: "otp_expired" }), /expired/i);
    assert.match(
      formatEmailOtpError({ code: "over_email_send_rate_limit" }),
      /wait before resending/i
    );
  });

  it("does not expose raw provider messages by default", () => {
    assert.equal(
      formatEmailOtpError({ message: "User already registered" }),
      "Something went wrong. Please try again."
    );
  });
});
