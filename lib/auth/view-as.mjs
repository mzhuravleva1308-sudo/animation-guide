/** HttpOnly cookie: admin is viewing the site as this auth user UUID. */
export const VIEW_AS_USER_COOKIE_NAME = "animationpre-view-as-user";

/** 8 hours — long enough for a support session, not forever. */
export const VIEW_AS_COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizeViewAsUserId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * @param {boolean} isProduction
 */
export function buildViewAsCookieOptions(isProduction) {
  return {
    httpOnly: true,
    path: "/",
    /** @type {'lax'} */
    sameSite: "lax",
    secure: Boolean(isProduction),
    maxAge: VIEW_AS_COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * @param {boolean} isProduction
 */
export function buildClearViewAsCookieOptions(isProduction) {
  return {
    httpOnly: true,
    path: "/",
    /** @type {'lax'} */
    sameSite: "lax",
    secure: Boolean(isProduction),
    maxAge: 0,
  };
}
