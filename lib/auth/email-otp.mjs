export const EMAIL_OTP_LENGTH = 6;
export const EMAIL_OTP_RESEND_COOLDOWN_MS = 30_000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string} email
 * @returns {string}
 */
export function normalizeAuthEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * @param {string} email
 * @returns {boolean}
 */
export function isValidAuthEmail(email) {
  const normalized = normalizeAuthEmail(email);
  return normalized.length > 0 && EMAIL_PATTERN.test(normalized);
}

/**
 * @param {string} code
 * @returns {string}
 */
export function normalizeOtpCode(code) {
  return code.replace(/\D/g, "").slice(0, EMAIL_OTP_LENGTH);
}

/**
 * @param {string} code
 * @returns {boolean}
 */
export function isCompleteOtpCode(code) {
  return normalizeOtpCode(code).length === EMAIL_OTP_LENGTH;
}

/**
 * @param {string} email
 * @returns {string}
 */
export function maskAuthEmail(email) {
  const normalized = normalizeAuthEmail(email);
  const atIndex = normalized.indexOf("@");

  if (atIndex <= 0) {
    return normalized;
  }

  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const visibleLocal = localPart.slice(0, 1);

  return `${visibleLocal}••••@${domain}`;
}

/**
 * @param {string} email
 * @returns {string}
 */
export function formatCodeSentMessage(email) {
  return `We sent a 6-digit code to ${maskAuthEmail(email)}.`;
}

/**
 * When a send was rate-limited, a prior code may still be valid — do not claim a new send.
 * @param {string} email
 * @returns {string}
 */
export function formatExistingCodeMessage(email) {
  return `A sign-in code may already be waiting in your inbox for ${maskAuthEmail(email)}. Enter it below.`;
}

/**
 * Shown on the code step when resend is blocked by cooldown or provider rate limit.
 * @returns {string}
 */
export function formatResendCooldownMessage() {
  return "Please wait before resending. You can still enter the code from your inbox.";
}

/**
 * @param {{ code?: string | null, message?: string | null, status?: number | null } | null | undefined} error
 * @returns {boolean}
 */
export function isEmailOtpRateLimitError(error) {
  if (!error) {
    return false;
  }

  const code = String(error.code ?? "").toLowerCase();
  const message = String(error.message ?? "");

  if (error.status === 429) {
    return true;
  }

  if (code === "over_email_send_rate_limit") {
    return true;
  }

  if (/rate limit/i.test(message)) {
    return true;
  }

  if (/only request this (once|after)/i.test(message)) {
    return true;
  }

  return false;
}

/**
 * @param {{ code?: string | null, message?: string | null, status?: number | null } | null | undefined} error
 * @returns {"success" | "rate_limited" | "failed"}
 */
export function resolveEmailOtpSendOutcome(error) {
  if (!error) {
    return "success";
  }

  if (isEmailOtpRateLimitError(error)) {
    return "rate_limited";
  }

  return "failed";
}

/**
 * @param {number | null | undefined} lastSentAt
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function canResendEmailOtp(lastSentAt, now = Date.now()) {
  if (!lastSentAt) {
    return true;
  }

  return now - lastSentAt >= EMAIL_OTP_RESEND_COOLDOWN_MS;
}

/**
 * @param {number | null | undefined} lastSentAt
 * @param {number} [now=Date.now()]
 * @returns {number}
 */
export function getEmailOtpResendDelayMs(lastSentAt, now = Date.now()) {
  if (!lastSentAt) {
    return 0;
  }

  const remaining = EMAIL_OTP_RESEND_COOLDOWN_MS - (now - lastSentAt);
  return remaining > 0 ? remaining : 0;
}

/**
 * @param {{ code?: string | null, message?: string | null } | null | undefined} error
 * @returns {string}
 */
export function formatEmailOtpError(error) {
  const code = error?.code ?? null;
  const message = error?.message ?? "";

  if (code === "otp_expired") {
    return "That code has expired. Request a new code and try again.";
  }

  if (
    code === "invalid_otp" ||
    code === "otp_disabled" ||
    /invalid.*otp/i.test(message) ||
    /token.*invalid/i.test(message)
  ) {
    return "That code is incorrect. Check the code and try again.";
  }

  if (isEmailOtpRateLimitError(error)) {
    return formatResendCooldownMessage();
  }

  if (code === "validation_failed" || /valid email/i.test(message)) {
    return "Enter a valid email address.";
  }

  return "Something went wrong. Please try again.";
}
