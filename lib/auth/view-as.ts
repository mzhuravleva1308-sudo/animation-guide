import {
  VIEW_AS_USER_COOKIE_NAME as VIEW_AS_USER_COOKIE_NAME_VALUE,
  VIEW_AS_COOKIE_MAX_AGE_SECONDS as VIEW_AS_COOKIE_MAX_AGE_SECONDS_VALUE,
  normalizeViewAsUserId as normalizeViewAsUserIdImpl,
  buildViewAsCookieOptions as buildViewAsCookieOptionsImpl,
  buildClearViewAsCookieOptions as buildClearViewAsCookieOptionsImpl,
} from "./view-as.mjs";

export const VIEW_AS_USER_COOKIE_NAME = VIEW_AS_USER_COOKIE_NAME_VALUE;
export const VIEW_AS_COOKIE_MAX_AGE_SECONDS =
  VIEW_AS_COOKIE_MAX_AGE_SECONDS_VALUE;
export const normalizeViewAsUserId = normalizeViewAsUserIdImpl;

export type ViewAsCookieOptions = {
  httpOnly: boolean;
  path: string;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
};

export function buildViewAsCookieOptions(
  isProduction: boolean
): ViewAsCookieOptions {
  return buildViewAsCookieOptionsImpl(isProduction) as ViewAsCookieOptions;
}

export function buildClearViewAsCookieOptions(
  isProduction: boolean
): ViewAsCookieOptions {
  return buildClearViewAsCookieOptionsImpl(isProduction) as ViewAsCookieOptions;
}
