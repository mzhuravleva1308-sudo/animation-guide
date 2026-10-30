import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  buildClearViewAsCookieOptions,
  VIEW_AS_USER_COOKIE_NAME,
} from "@/lib/auth/view-as";

export async function POST(request: Request) {
  const supabase = await createClient();
  // Only end this browser's session — do not revoke other devices.
  await supabase.auth.signOut({ scope: "local" });

  const { origin } = new URL(request.url);
  const response = NextResponse.redirect(`${origin}/`);
  response.cookies.set(
    VIEW_AS_USER_COOKIE_NAME,
    "",
    buildClearViewAsCookieOptions(process.env.NODE_ENV === "production")
  );
  return response;
}
