export const MAGIC_LINK_RESEND_COOLDOWN_MS = 30_000;

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
 * @param {string} email
 * @returns {string}
 */
export function formatLinkSentBody(email) {
  return `We sent a sign-in link to ${normalizeAuthEmail(email)}. Open the link in the email to continue.`;
}

/**
 * When a send was rate-limited, a prior link may still be valid — do not claim a new send.
 * @param {string} email
 * @returns {string}
 */
export function formatExistingLinkBody(email) {
  return `A sign-in link may already be waiting in your inbox for ${normalizeAuthEmail(email)}. Open the link in the email to continue.`;
}

/**
 * Shown on the confirmation step when resend is blocked by cooldown or provider rate limit.
 * @returns {string}
 */
export function formatResendCooldownMessage() {
  return "Please wait before resending. Check your inbox for the sign-in link we sent earlier.";
}

/**
 * @param {{ code?: string | null, message?: string | null, status?: number | null } | null | undefined} error
 * @returns {boolean}
 */
export function isMagicLinkRateLimitError(error) {
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
export function resolveMagicLinkSendOutcome(error) {
  if (!error) {
    return "success";
  }

  if (isMagicLinkRateLimitError(error)) {
    return "rate_limited";
  }

  return "failed";
}

/**
 * @param {number | null | undefined} lastSentAt
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function canResendMagicLink(lastSentAt, now = Date.now()) {
  if (!lastSentAt) {
    return true;
  }

  return now - lastSentAt >= MAGIC_LINK_RESEND_COOLDOWN_MS;
}

/**
 * @param {number | null | undefined} lastSentAt
 * @param {number} [now=Date.now()]
 * @returns {number}
 */
export function getMagicLinkResendDelayMs(lastSentAt, now = Date.now()) {
  if (!lastSentAt) {
    return 0;
  }

  const remaining = MAGIC_LINK_RESEND_COOLDOWN_MS - (now - lastSentAt);
  return remaining > 0 ? remaining : 0;
}

/**
 * @param {{ code?: string | null, message?: string | null } | null | undefined} error
 * @returns {string}
 */
export function formatMagicLinkError(error) {
  const code = error?.code ?? null;
  const message = error?.message ?? "";

  if (isMagicLinkRateLimitError(error)) {
    return formatResendCooldownMessage();
  }

  if (code === "validation_failed" || /valid email/i.test(message)) {
    return "Enter a valid email address.";
  }

  return "Something went wrong. Please try again.";
}
