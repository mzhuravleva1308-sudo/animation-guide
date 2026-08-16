/**
 * Send weekly film discovery report via Resend (same infra as weekly import).
 */

import { formatWeeklyFilmDiscoveryEmail } from "./film-discovery-email.mjs";

/**
 * @param {object} report — output of runWeeklyFilmDiscovery (or { email: { subject, text } })
 * @param {{
 *   apiKey?: string,
 *   to?: string,
 *   from?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export async function sendWeeklyFilmDiscoveryEmail(report, options = {}) {
  const apiKey = options.apiKey || process.env.RESEND_API_KEY;
  const to =
    options.to ||
    process.env.WEEKLY_FILM_DISCOVERY_REPORT_EMAIL ||
    process.env.WEEKLY_FILM_IMPORT_REPORT_EMAIL ||
    "";
  const from =
    options.from ||
    process.env.WEEKLY_FILM_DISCOVERY_EMAIL_FROM ||
    process.env.WEEKLY_FILM_IMPORT_EMAIL_FROM ||
    "Resonale <onboarding@resend.dev>";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is required to send the weekly discovery report"
    );
  }
  if (!to.trim()) {
    throw new Error(
      "WEEKLY_FILM_DISCOVERY_REPORT_EMAIL or WEEKLY_FILM_IMPORT_REPORT_EMAIL is required"
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }

  const email =
    report.email ??
    formatWeeklyFilmDiscoveryEmail({
      brief: report.brief,
      researchRounds: report.researchRounds ?? 0,
      passed: report.passed ?? [],
      failed: report.failed ?? [],
      incomplete: Boolean(report.incomplete),
      incompleteNotes: report.incompleteNotes,
      rejectionSummary: report.rejectionSummary,
    });

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
