import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import { buildImpersonationCallbackPath } from "@/lib/auth/admin-impersonate";
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

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await request.formData();
    return readUserId(form.get("userId"));
  }

  return readUserId(request.nextUrl.searchParams.get("userId"));
}

export async function POST(request: NextRequest) {
  const access = await requireAdminApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const targetUserId = await resolveTargetUserId(request);
  if (!targetUserId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
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
    return NextResponse.json(
      { error: "Already signed in as this user" },
      { status: 400 }
    );
  }

  const admin = getAdminSupabase();
  const { data: target, error: targetError } =
    await admin.auth.admin.getUserById(targetUserId);

  if (targetError || !target.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const email = target.user.email?.trim();
  if (!email) {
    return NextResponse.json(
      { error: "Target user has no email; cannot generate a session link" },
      { status: 400 }
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
    return NextResponse.json(
      { error: "Failed to create impersonation session" },
      { status: 500 }
    );
  }

  console.info("[admin/impersonate] session takeover", {
    adminUserId: adminUser.id,
    targetUserId,
  });

  const callbackPath = buildImpersonationCallbackPath(hashedToken, "/");
  return NextResponse.redirect(new URL(callbackPath, request.url), 303);
}
