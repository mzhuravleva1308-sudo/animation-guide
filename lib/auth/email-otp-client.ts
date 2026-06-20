import { createClient } from "@/lib/supabase/client";
import {
  isCompleteOtpCode,
  isValidAuthEmail,
  normalizeAuthEmail,
  normalizeOtpCode,
} from "@/lib/auth/email-otp";

type AuthActionError = {
  code?: string | null;
  message?: string | null;
};

type AuthActionResult = {
  error: AuthActionError | null;
};

export async function requestEmailOtp(email: string): Promise<AuthActionResult> {
  const normalizedEmail = normalizeAuthEmail(email);

  if (!isValidAuthEmail(normalizedEmail)) {
    return {
      error: {
        code: "validation_failed",
        message: "Enter a valid email address.",
      },
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
    },
  });

  return { error };
}

export async function verifyEmailOtp(
  email: string,
  code: string
): Promise<AuthActionResult> {
  const normalizedEmail = normalizeAuthEmail(email);
  const normalizedCode = normalizeOtpCode(code);

  if (!isValidAuthEmail(normalizedEmail)) {
    return {
      error: {
        code: "validation_failed",
        message: "Enter a valid email address.",
      },
    };
  }

  if (!isCompleteOtpCode(normalizedCode)) {
    return {
      error: {
        code: "invalid_otp",
        message: "Enter the 6-digit code.",
      },
    };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedCode,
    type: "email",
  });

  return { error };
}
