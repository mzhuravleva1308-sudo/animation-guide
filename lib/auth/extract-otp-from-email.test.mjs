import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractOtpFromEmailContent } from "./extract-otp-from-email.mjs";

describe("extractOtpFromEmailContent", () => {
  it("extracts a six-digit OTP from plain text", () => {
    assert.equal(
      extractOtpFromEmailContent("Your sign-in code is 482913. It expires soon."),
      "482913"
    );
  });

  it("extracts a six-digit OTP from HTML email bodies", () => {
    const html = `
      <h2>Your sign-in code</h2>
      <p style="font-size: 28px; letter-spacing: 0.35em;">847201</p>
    `;

    assert.equal(extractOtpFromEmailContent(html), "847201");
  });

  it("returns null when no OTP is present", () => {
    assert.equal(
      extractOtpFromEmailContent("Thanks for signing up."),
      null
    );
  });
});
