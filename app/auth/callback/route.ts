import { createCallbackClient } from "@/lib/supabase/callback";
import { applyPendingFilmActionWithClient } from "@/lib/apply-pending-film-action-callback";
import { autoLinkE2eProfileForAuthUser } from "@/lib/e2e/auto-link-auth-profile";
import {
  formatAuthCallbackError,
  hasPkceVerifierCookie,
  logAuthCallbackError,
} from "@/lib/auth/callback-error";
import { resolveAuthOriginFromRequest } from "@/lib/auth/callback-origin";
import {
  AUTH_NEXT_PATH_COOKIE_NAME,
  resolveAuthCallbackNextPath,
} from "@/lib/auth/auth-next-path";
import {
  normalizeEmailOtpType,
  resolveCallbackMethod,
} from "@/lib/auth/callback-params";
import { ensureAuthProfileForUser } from "@/lib/auth/ensure-auth-profile";
import {
  appendAuthCallbackErrorToPath,
  resolvePostAuthRedirectPath,
} from "@/lib/auth/resolve-post-auth-redirect";
import {
  PENDING_FILM_ACTION_COOKIE_NAME,
  readPendingFilmActionFromCookies,
} from "@/lib/pending-film-action";
import {
  decodePendingFilmActionFromCallback,
  PENDING_FILM_ACTION_QUERY_PARAM,
} from "@/lib/pending-film-action-callback";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

type AuthCallbackFinalizeResult =
  | {
      kind: "success";
      redirectPath: string;
      clearPendingCookie: boolean;
    }
  | {
      kind: "profile_error";
      redirectPath: string;
    }
  | {
      kind: "pending_apply_error";
      redirectPath: string;
    };

async function finalizeAuthenticatedCallback(
  request: NextRequest,
  requestUrl: URL,
  nextPath: string,
  authCallbackType: string | null,
  supabase: ReturnType<typeof createCallbackClient>
): Promise<AuthCallbackFinalizeResult | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  await autoLinkE2eProfileForAuthUser(user);

  let profile;
  try {
    ({ profile } = await ensureAuthProfileForUser(supabase, user));
  } catch (error) {
    console.error("[auth/callback] failed to ensure auth profile", {
      userId: user.id,
      message: error instanceof Error ? error.message : "unknown error",
    });

    return {
      kind: "profile_error",
      redirectPath: appendAuthCallbackErrorToPath(
        nextPath,
        "We signed you in, but couldn't set up your personal guide. Please try again.",
        "profile_provision_failed"
      ),
    };
  }

  if (!profile?.id || !profile.slug || !profile.share_token) {
    return {
      kind: "profile_error",
      redirectPath: appendAuthCallbackErrorToPath(
        nextPath,
        "We signed you in, but couldn't set up your personal guide. Please try again.",
        "profile_provision_failed"
      ),
    };
  }

  const pendingAction =
    decodePendingFilmActionFromCallback(
      requestUrl.searchParams.get(PENDING_FILM_ACTION_QUERY_PARAM)
    ) ?? readPendingFilmActionFromCookies(request.cookies.getAll());
  const hadPendingAction = Boolean(pendingAction);

  if (pendingAction) {
    const result = await applyPendingFilmActionWithClient(
      supabase,
      profile.id,
      pendingAction
    );

    if (result.error) {
      console.error("[auth/callback] failed to apply pending film action", {
        actionId: pendingAction.id,
        actionType: pendingAction.type,
        message: result.error,
      });

      return {
        kind: "pending_apply_error",
        redirectPath: appendAuthCallbackErrorToPath(
          nextPath,
          "We signed you in, but couldn't save your film action. Please try again from the catalog.",
          "pending_action_failed"
        ),
      };
    }
  }

  return {
    kind: "success",
    redirectPath: resolvePostAuthRedirectPath({
      profile,
      nextPath,
      hadPendingAction,
      authCallbackType,
    }),
    clearPendingCookie: hadPendingAction,
  };
}

function buildLoginErrorRedirect(
  origin: string,
  userMessage: string,
  authErrorCode?: string | null
) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", userMessage);

  if (authErrorCode) {
    loginUrl.searchParams.set("auth_error", authErrorCode);
  }

  return NextResponse.redirect(loginUrl);
}

function applyFinalizeResultToResponse(
  response: NextResponse,
  origin: string,
  nextPath: string,
  result: AuthCallbackFinalizeResult | null
) {
  const redirectPath = result?.redirectPath ?? nextPath;

  response.headers.set("Location", new URL(redirectPath, origin).toString());

  if (result?.kind === "success" && result.clearPendingCookie) {
    response.cookies.set(PENDING_FILM_ACTION_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
    });
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = resolveAuthCallbackNextPath(
    requestUrl.searchParams.get("next"),
    request.cookies.getAll()
  );
  const origin = resolveAuthOriginFromRequest(
    request,
    process.env.NEXT_PUBLIC_SITE_URL
  );
  const callback = resolveCallbackMethod(requestUrl.searchParams);

  if (callback.method === "missing") {
    console.error("[auth/callback] missing callback parameters", {
      origin,
      callbackHost: requestUrl.host,
      hasTokenHash: requestUrl.searchParams.has("token_hash"),
      hasType: requestUrl.searchParams.has("type"),
      hasCode: requestUrl.searchParams.has("code"),
    });

    return buildLoginErrorRedirect(
      origin,
      "Missing authentication parameters.",
      "missing_callback_params"
    );
  }

  const successRedirect = NextResponse.redirect(new URL(next, origin));
  successRedirect.cookies.set(AUTH_NEXT_PATH_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });
  const supabase = createCallbackClient(request, successRedirect);

  if (callback.method === "verify_otp") {
    const otpType = normalizeEmailOtpType(callback.otpType);

    if (!otpType) {
      return buildLoginErrorRedirect(
        origin,
        "Invalid sign-in link.",
        "invalid_otp_type"
      );
    }

    const { error } = await supabase.auth.verifyOtp({
      token_hash: callback.tokenHash,
      type: otpType as EmailOtpType,
    });

    if (error) {
      logAuthCallbackError(error, {
        origin,
        callbackHost: requestUrl.host,
        method: "verify_otp",
        otpType,
      });

      return buildLoginErrorRedirect(
        origin,
        formatAuthCallbackError(error),
        error.code
      );
    }

    const finalizeResult = await finalizeAuthenticatedCallback(
      request,
      requestUrl,
      next,
      otpType,
      supabase
    );
    applyFinalizeResultToResponse(successRedirect, origin, next, finalizeResult);

    return successRedirect;
  }

  const hasCodeVerifierCookie = hasPkceVerifierCookie(request);
  const { error } = await supabase.auth.exchangeCodeForSession(callback.code);

  if (error) {
    logAuthCallbackError(error, {
      origin,
      callbackHost: requestUrl.host,
      method: "exchange_code",
      hasCodeVerifierCookie,
    });

    return buildLoginErrorRedirect(
      origin,
      formatAuthCallbackError(error),
      error.code
    );
  }

  const finalizeResult = await finalizeAuthenticatedCallback(
    request,
    requestUrl,
    next,
    null,
    supabase
  );
  applyFinalizeResultToResponse(successRedirect, origin, next, finalizeResult);

  return successRedirect;
}
