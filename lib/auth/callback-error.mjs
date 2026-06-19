/**
 * @param {{ code?: string | null, message?: string }} error
 * @returns {string}
 */
export function formatAuthCallbackError(error) {
  const code = error.code ?? "unknown";

  if (code === "otp_expired" || code === "flow_state_expired" || code === "flow_state_not_found") {
    return "This sign-in link has expired. Request a new magic link.";
  }

  if (code === "validation_failed" || code === "invalid_grant" || code === "otp_disabled") {
    return "Invalid or expired sign-in link. Request a new magic link.";
  }

  if (code === "pkce_code_verifier_not_found") {
    return "This sign-in link requires a newer email template. Request a new magic link, or contact support if the problem persists.";
  }

  return `Could not sign you in (${code}). Try again.`;
}

/**
 * @param {{ code?: string | null, message?: string, status?: number | null }} error
 * @param {{ origin: string, callbackHost: string, method: string, otpType?: string | null, hasCodeVerifierCookie?: boolean | null }} context
 */
export function logAuthCallbackError(error, context) {
  console.error("[auth/callback] authentication failed", {
    errorCode: error.code ?? "unknown",
    errorMessage: error.message,
    errorStatus: error.status ?? null,
    method: context.method,
    otpType: context.otpType ?? null,
    origin: context.origin,
    callbackHost: context.callbackHost,
    hasCodeVerifierCookie: context.hasCodeVerifierCookie ?? null,
  });
}

/**
 * @param {{ cookies: { getAll: () => Array<{ name: string }> } }} request
 * @returns {boolean}
 */
export function hasPkceVerifierCookie(request) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("code-verifier"));
}
