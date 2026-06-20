import { EMAIL_OTP_LENGTH } from "./email-otp.mjs";

/**
 * @param {string | null | undefined} content
 * @param {number} [otpLength=EMAIL_OTP_LENGTH]
 * @returns {string | null}
 */
export function extractOtpFromEmailContent(content, otpLength = EMAIL_OTP_LENGTH) {
  if (!content?.trim()) {
    return null;
  }

  const normalized = content
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const pattern = new RegExp(`\\b(\\d{${otpLength}})\\b`);
  const match = normalized.match(pattern);

  return match?.[1] ?? null;
}
