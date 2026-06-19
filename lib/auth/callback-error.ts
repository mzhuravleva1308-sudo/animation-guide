import type { AuthError } from "@supabase/supabase-js";

export function formatAuthCallbackError(error: Pick<AuthError, "code" | "message">): string {
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

type AuthCallbackLogContext = {
  origin: string;
  callbackHost: string;
  method: "verify_otp" | "exchange_code" | "missing";
  otpType?: string | null;
  hasCodeVerifierCookie?: boolean;
};

export function logAuthCallbackError(
  error: Pick<AuthError, "code" | "message" | "status">,
  context: AuthCallbackLogContext
): void {
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

export function hasPkceVerifierCookie(
  request: { cookies: { getAll: () => Array<{ name: string }> } }
): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("code-verifier"));
}
