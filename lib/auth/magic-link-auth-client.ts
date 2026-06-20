import { getAuthCallbackUrl } from "@/lib/auth/callback-url";
import { resolveAuthOrigin } from "@/lib/auth/callback-origin";
import {
  isValidAuthEmail,
  normalizeAuthEmail,
} from "@/lib/auth/magic-link-auth";
import { createClient } from "@/lib/supabase/client";

type AuthActionError = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

type AuthActionResult = {
  error: AuthActionError | null;
};

export async function requestMagicLink(
  email: string,
  nextPath: string
): Promise<AuthActionResult> {
  const normalizedEmail = normalizeAuthEmail(email);

  if (!isValidAuthEmail(normalizedEmail)) {
    return {
      error: {
        code: "validation_failed",
        message: "Enter a valid email address.",
      },
    };
  }

  const authOrigin = resolveAuthOrigin(
    window.location.origin,
    process.env.NEXT_PUBLIC_SITE_URL
  );
  const emailRedirectTo = getAuthCallbackUrl(authOrigin, nextPath);

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo,
    },
  });

  return {
    error: error
      ? {
          code: error.code ?? null,
          message: error.message ?? null,
          status: error.status ?? null,
        }
      : null,
  };
}
