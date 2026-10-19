import type { CookieOptionsWithName } from "@supabase/ssr";
import {
  AUTH_COOKIE_OPTIONS as AUTH_COOKIE_OPTIONS_VALUE,
  isClearingAllAuthTokenCookies,
  isSupabaseAuthTokenCookie,
} from "./cookie-options.mjs";

export const AUTH_COOKIE_OPTIONS =
  AUTH_COOKIE_OPTIONS_VALUE as CookieOptionsWithName;

export { isClearingAllAuthTokenCookies, isSupabaseAuthTokenCookie };
