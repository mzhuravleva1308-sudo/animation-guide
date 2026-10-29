import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCallbackClient } from "@/lib/supabase/callback";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import { ensureAuthProfileForUser } from "@/lib/auth/ensure-auth-profile";
import { resolveAuthOriginFromRequest } from "@/lib/auth/callback-origin";
import { AUTH_NEXT_PATH_COOKIE_NAME } from "@/lib/auth/auth-next-path";
import { PENDING_FILM_ACTION_COOKIE_NAME } from "@/lib/pending-film-action";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function readUserId(value: FormDataEntryValue | string | null): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

async function resolveTargetUserId(request: NextRequest): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      userId?: unknown;
    } | null;
    return readUserId(
      typeof body?.userId === "string" ? body.userId : null
    );
  }

  // HTML forms and most browsers: always try form body first for POST.
  try {
    const form = await request.formData();
    const fromForm = readUserId(form.get("userId"));
    if (fromForm) return fromForm;
  } catch {
    // Not a form body — fall through.
  }

  return readUserId(request.nextUrl.searchParams.get("userId"));
}

function redirectToUsersError(request: NextRequest, message: string) {
  const origin = resolveAuthOriginFromRequest(
    request,
    process.env.NEXT_PUBLIC_SITE_URL
  );
  const url = new URL("/admin/users", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  const access = await requireAdminApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const targetUserId = await resolveTargetUserId(request);
  if (!targetUserId) {
    return redirectToUsersError(request, "Missing user id.");
  }

  const sessionClient = await createClient();
  const {
    data: { user: adminUser },
  } = await sessionClient.auth.getUser();

  if (!adminUser) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  if (adminUser.id === targetUserId) {
    return redirectToUsersError(request, "Already signed in as this user.");
  }

  const admin = getAdminSupabase();
  const { data: target, error: targetError } =
    await admin.auth.admin.getUserById(targetUserId);

  if (targetError || !target.user) {
    return redirectToUsersError(request, "User not found.");
  }

  const email = target.user.email?.trim();
  if (!email) {
    return redirectToUsersError(
      request,
      "That account has no email, so a session link cannot be created."
    );
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const hashedToken = data.properties?.hashed_token;
  if (error || !hashedToken) {
    console.error("[admin/impersonate] generateLink failed", {
      adminUserId: adminUser.id,
      targetUserId,
      message: error?.message ?? "missing hashed_token",
    });
    return redirectToUsersError(
      request,
      "Failed to create impersonation session."
    );
  }

  const origin = resolveAuthOriginFromRequest(
    request,
    process.env.NEXT_PUBLIC_SITE_URL
  );
  // Complete the session switch here — do not send the browser through
  // /auth/callback. That path applies pending film-action cookies and can
  // surface a post-login error even though the takeover succeeded.
  const response = NextResponse.redirect(new URL("/", origin), 303);
  response.cookies.set(PENDING_FILM_ACTION_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(AUTH_NEXT_PATH_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
  });

  const supabase = createCallbackClient(request, response);
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });

  if (verifyError) {
    console.error("[admin/impersonate] verifyOtp failed", {
      adminUserId: adminUser.id,
      targetUserId,
      message: verifyError.message,
      code: verifyError.code,
    });
    return redirectToUsersError(
      request,
      "Could not switch session. Try again."
    );
  }

  try {
    await ensureAuthProfileForUser(admin, {
      id: target.user.id,
      email: target.user.email,
    });
  } catch (profileError) {
    // Session is already the target user; profile can be repaired later.
    console.error("[admin/impersonate] profile ensure failed", {
      adminUserId: adminUser.id,
      targetUserId,
      message:
        profileError instanceof Error ? profileError.message : "unknown error",
    });
  }

  console.info("[admin/impersonate] session takeover", {
    adminUserId: adminUser.id,
    targetUserId,
  });

  return response;
}
