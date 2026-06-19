const ALLOWED_EMAIL_OTP_TYPES = new Set([
  "magiclink",
  "signup",
  "invite",
  "recovery",
  "email_change",
  "email",
]);

export type CallbackMethod =
  | { method: "verify_otp"; tokenHash: string; otpType: string }
  | { method: "exchange_code"; code: string }
  | { method: "missing" };

export function resolveCallbackMethod(
  searchParams: URLSearchParams
): CallbackMethod {
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

export function normalizeEmailOtpType(
  otpType?: string | null
): string | null {
  if (!otpType) {
    return null;
  }

  const normalized = otpType.trim().toLowerCase();

  if (!ALLOWED_EMAIL_OTP_TYPES.has(normalized)) {
    return null;
  }

  return normalized;
}
