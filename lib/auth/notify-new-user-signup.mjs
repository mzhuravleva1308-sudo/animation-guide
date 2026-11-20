/**
 * Best-effort owner notification after a first profile is provisioned.
 * Never throws — auth/callback must not fail because email is down.
 */

import { sendNewUserSignupEmail } from "../send-new-user-signup-email.mjs";

/**
 * @param {{
 *   user: { id: string, email?: string | null, created_at?: string | null },
 *   profile: { id: string, slug: string },
 *   sendEmailFn?: typeof sendNewUserSignupEmail,
 * }} args
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function notifyNewUserSignup({
  user,
  profile,
  sendEmailFn = sendNewUserSignupEmail,
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to =
    process.env.NEW_USER_SIGNUP_NOTIFY_EMAIL ||
    process.env.WEEKLY_FILM_IMPORT_REPORT_EMAIL ||
    "";

  if (!apiKey) {
    return { sent: false, reason: "missing_api_key" };
  }
  if (!to.trim()) {
    return { sent: false, reason: "missing_to" };
  }

  try {
    await sendEmailFn({
      email: user.email ?? null,
      userId: user.id,
      profileId: profile.id,
      profileSlug: profile.slug,
      createdAt: user.created_at ?? null,
    });
    return { sent: true };
  } catch (error) {
    console.error("[auth] failed to send new-user signup email", {
      userId: user.id,
      profileId: profile.id,
      message: error instanceof Error ? error.message : "unknown error",
    });
    return { sent: false, reason: "send_failed" };
  }
}
