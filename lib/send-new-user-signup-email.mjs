/**
 * Notify the project owner when a new auth user gets a first profile.
 * Uses the same Resend HTTP API as weekly import / discovery reports.
 */

/**
 * @param {{
 *   email?: string | null,
 *   userId: string,
 *   profileId: string,
 *   profileSlug: string,
 *   createdAt?: string | null,
 * }} payload
 */
export function formatNewUserSignupEmail(payload) {
  const email = payload.email?.trim() || "(no email)";
  const createdAt = payload.createdAt?.trim() || new Date().toISOString();

  return {
    subject: `Resonale — new user: ${email}`,
    text: [
      "A new Resonale user just got their first profile.",
      "",
      `Email: ${email}`,
      `User id: ${payload.userId}`,
      `Profile id: ${payload.profileId}`,
      `Profile slug: ${payload.profileSlug}`,
      `Created at: ${createdAt}`,
    ].join("\n"),
  };
}

/**
 * @param {{
 *   email?: string | null,
 *   userId: string,
 *   profileId: string,
 *   profileSlug: string,
 *   createdAt?: string | null,
 * }} payload
 * @param {{
 *   apiKey?: string,
 *   to?: string,
 *   from?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export async function sendNewUserSignupEmail(payload, options = {}) {
  const apiKey = options.apiKey || process.env.RESEND_API_KEY;
  const to =
    options.to || process.env.WEEKLY_FILM_IMPORT_REPORT_EMAIL || "";
  const from =
    options.from ||
    process.env.WEEKLY_FILM_IMPORT_EMAIL_FROM ||
    "Resonale <onboarding@resend.dev>";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required to send new-user signup email");
  }
  if (!to.trim()) {
    throw new Error(
      "WEEKLY_FILM_IMPORT_REPORT_EMAIL is required to send new-user signup email"
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }

  const email = formatNewUserSignupEmail(payload);
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to.trim()],
      subject: email.subject,
      text: email.text,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
    const safeDetail = detail.replace(apiKey, "[redacted]").slice(0, 200);
    throw new Error(
      `Resend email failed (${response.status})${safeDetail ? `: ${safeDetail}` : ""}`
    );
  }

  return { subject: email.subject, to: to.trim() };
}
