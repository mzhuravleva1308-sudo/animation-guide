const ALLOWED_EMAIL_OTP_TYPES = new Set([
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
  "email",
]);

/**
 * @typedef {'verify_otp' | 'exchange_code' | 'missing'} CallbackMethod
 */

/**
 * @param {URLSearchParams} searchParams
 * @returns {{ method: 'verify_otp', tokenHash: string, otpType: string } | { method: 'exchange_code', code: string } | { method: 'missing' }}
 */
export function resolveCallbackMethod(searchParams) {
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type");
  const code = searchParams.get("code");

  if (tokenHash && otpType) {
    return {
      method: "verify_otp",
      tokenHash,
      otpType,
    };
  }

  if (code) {
    return {
      method: "exchange_code",
      code,
    };
  }

  return { method: "missing" };
}

/**
 * @param {string | null | undefined} otpType
 * @returns {string | null}
 */
export function normalizeEmailOtpType(otpType) {
  if (!otpType) {
    return null;
  }

  const normalized = otpType.trim().toLowerCase();

  if (!ALLOWED_EMAIL_OTP_TYPES.has(normalized)) {
    return null;
  }

  return normalized;
}
