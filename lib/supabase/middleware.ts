import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE_OPTIONS,
  isClearingAllAuthTokenCookies,
} from "@/lib/supabase/cookie-options";

export async function updateSession(request: NextRequest) {
  if (request.nextUrl.pathname === "/auth/callback") {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // After reboot / multi-tab restore, several requests refresh the same
        // expired JWT. The loser can try to clear auth cookies; applying that
        // wipe after a winner's Set-Cookie logs the user out. Keep session
        // cookies when the whole auth token set is being cleared here.
        if (isClearingAllAuthTokenCookies(cookiesToSet)) {
          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
          return;
        }

        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  // Verify / refresh without an Auth /user round-trip on every request.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
