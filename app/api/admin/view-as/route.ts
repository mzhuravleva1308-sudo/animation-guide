import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import { ensureAuthProfileForUser } from "@/lib/auth/ensure-auth-profile";
import { resolveAuthOriginFromRequest } from "@/lib/auth/callback-origin";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import {
  buildViewAsCookieOptions,
  normalizeViewAsUserId,
  VIEW_AS_USER_COOKIE_NAME,
} from "@/lib/auth/view-as";

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

  try {
    const form = await request.formData();
    const fromForm = readUserId(form.get("userId"));
    if (fromForm) return fromForm;
  } catch {
    // fall through
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

  const targetUserId = normalizeViewAsUserId(await resolveTargetUserId(request));
  if (!targetUserId) {
    return redirectToUsersError(request, "Missing or invalid user id.");
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

  try {
    await ensureAuthProfileForUser(admin, {
      id: target.user.id,
      email: target.user.email,
    });
  } catch (profileError) {
    console.error("[admin/view-as] profile ensure failed", {
      adminUserId: adminUser.id,
      targetUserId,
      message:
        profileError instanceof Error ? profileError.message : "unknown error",
    });
    return redirectToUsersError(
      request,
      "Could not ensure a profile for that user."
    );
  }

  const origin = resolveAuthOriginFromRequest(
    request,
    process.env.NEXT_PUBLIC_SITE_URL
  );
  const response = NextResponse.redirect(new URL("/", origin), 303);
  response.cookies.set(
    VIEW_AS_USER_COOKIE_NAME,
    targetUserId,
    buildViewAsCookieOptions(process.env.NODE_ENV === "production")
  );

  console.info("[admin/view-as] started", {
    adminUserId: adminUser.id,
    targetUserId,
  });

  return response;
}
