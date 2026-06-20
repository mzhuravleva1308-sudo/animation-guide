import { createCallbackClient } from "@/lib/supabase/callback";
import { applyPendingFilmActionWithClient } from "@/lib/apply-pending-film-action-callback";
import { autoLinkE2eProfileForAuthUser } from "@/lib/e2e/auto-link-auth-profile";
import {
  formatAuthCallbackError,
  hasPkceVerifierCookie,
  logAuthCallbackError,
} from "@/lib/auth/callback-error";
import {
  resolveAuthOriginFromRequest,
  sanitizeNextPath,
} from "@/lib/auth/callback-origin";
import {
  normalizeEmailOtpType,
  resolveCallbackMethod,
} from "@/lib/auth/callback-params";
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

async function applyPendingFilmActionFromCallbackRequest(
  request: NextRequest,
  requestUrl: URL,
  response: NextResponse,
  supabase: ReturnType<typeof createCallbackClient>
) {
  const pendingAction =
    decodePendingFilmActionFromCallback(
      requestUrl.searchParams.get(PENDING_FILM_ACTION_QUERY_PARAM)
    ) ?? readPendingFilmActionFromCookies(request.cookies.getAll());

  if (!pendingAction) {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  await autoLinkE2eProfileForAuthUser(user);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) {
    return;
  }

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
    return;
  }

  response.cookies.set(PENDING_FILM_ACTION_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });
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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));
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

    await applyPendingFilmActionFromCallbackRequest(
      request,
      requestUrl,
      successRedirect,
      supabase
    );

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

  await applyPendingFilmActionFromCallbackRequest(
    request,
    requestUrl,
    successRedirect,
    supabase
  );

  return successRedirect;
}
