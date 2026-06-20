import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canResendMagicLink,
  formatExistingLinkBody,
  formatLinkSentBody,
  formatMagicLinkError,
  formatResendCooldownMessage,
  getMagicLinkResendDelayMs,
  isMagicLinkRateLimitError,
  isValidAuthEmail,
  normalizeAuthEmail,
  resolveMagicLinkSendOutcome,
} from "./magic-link-auth.mjs";

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

describe("formatLinkSentBody", () => {
  it("uses neutral copy without account hints", () => {
    assert.equal(
      formatLinkSentBody("maria@example.com"),
      "We sent a sign-in link to maria@example.com. Open the link in the email to continue."
    );
    assert.doesNotMatch(formatLinkSentBody("maria@example.com"), /code/i);
  });
});

describe("formatExistingLinkBody", () => {
  it("does not claim a new link was sent", () => {
    assert.match(
      formatExistingLinkBody("maria@example.com"),
      /may already be waiting/i
    );
    assert.doesNotMatch(formatExistingLinkBody("maria@example.com"), /We sent/i);
  });
});

describe("formatResendCooldownMessage", () => {
  it("points users to their inbox while resend is blocked", () => {
    assert.match(formatResendCooldownMessage(), /wait before resending/i);
    assert.match(formatResendCooldownMessage(), /inbox/i);
    assert.doesNotMatch(formatResendCooldownMessage(), /code/i);
  });
});

describe("isMagicLinkRateLimitError", () => {
  it("detects provider rate-limit codes and messages", () => {
    assert.equal(
      isMagicLinkRateLimitError({ code: "over_email_send_rate_limit" }),
      true
    );
    assert.equal(
      isMagicLinkRateLimitError({
        message:
          "For security purposes, you can only request this once every 60 seconds",
      }),
      true
    );
    assert.equal(isMagicLinkRateLimitError({ status: 429 }), true);
    assert.equal(isMagicLinkRateLimitError({ code: "invalid_otp" }), false);
  });
});

describe("resolveMagicLinkSendOutcome", () => {
  it("classifies send results for UI transitions", () => {
    assert.equal(resolveMagicLinkSendOutcome(null), "success");
    assert.equal(
      resolveMagicLinkSendOutcome({ code: "over_email_send_rate_limit" }),
      "rate_limited"
    );
    assert.equal(
      resolveMagicLinkSendOutcome({ code: "unexpected_failure" }),
      "failed"
    );
  });
});

describe("canResendMagicLink", () => {
  it("blocks resends during the cooldown window", () => {
    const now = 1_000_000;
    const lastSentAt = now - 10_000;

    assert.equal(canResendMagicLink(lastSentAt, now), false);
    assert.equal(canResendMagicLink(lastSentAt - 30_000, now), true);
    assert.equal(canResendMagicLink(null, now), true);
  });
});

describe("getMagicLinkResendDelayMs", () => {
  it("returns remaining cooldown time", () => {
    const now = 1_000_000;
    const lastSentAt = now - 10_000;

    assert.equal(getMagicLinkResendDelayMs(lastSentAt, now), 20_000);
    assert.equal(getMagicLinkResendDelayMs(null, now), 0);
  });
});

describe("formatMagicLinkError", () => {
  it("maps failures to safe user-facing messages", () => {
    assert.match(
      formatMagicLinkError({ code: "over_email_send_rate_limit" }),
      /wait before resending/i
    );
    assert.equal(
      formatMagicLinkError({ code: "validation_failed" }),
      "Enter a valid email address."
    );
  });

  it("does not expose raw provider messages by default", () => {
    assert.equal(
      formatMagicLinkError({ message: "User already registered" }),
      "Something went wrong. Please try again."
    );
  });
});
