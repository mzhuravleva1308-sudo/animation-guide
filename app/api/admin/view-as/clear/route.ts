import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import { resolveAuthOriginFromRequest } from "@/lib/auth/callback-origin";
import {
  buildClearViewAsCookieOptions,
  VIEW_AS_USER_COOKIE_NAME,
} from "@/lib/auth/view-as";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Only the real admin should clear; cookie is ignored for everyone else anyway.
  const access = await requireAdminApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const origin = resolveAuthOriginFromRequest(
    request,
    process.env.NEXT_PUBLIC_SITE_URL
  );

  let nextParam = request.nextUrl.searchParams.get("next");
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !nextParam &&
    (contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data"))
  ) {
    try {
      const form = await request.formData();
      const fromForm = form.get("next");
      if (typeof fromForm === "string") nextParam = fromForm;
    } catch {
      // ignore
    }
  }

  const nextPath =
    typeof nextParam === "string" &&
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//")
      ? nextParam
      : "/admin/users";

  const response = NextResponse.redirect(new URL(nextPath, origin), 303);
  response.cookies.set(
    VIEW_AS_USER_COOKIE_NAME,
    "",
    buildClearViewAsCookieOptions(process.env.NODE_ENV === "production")
  );

  return response;
}
