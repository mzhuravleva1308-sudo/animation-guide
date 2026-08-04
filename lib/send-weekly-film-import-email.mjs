/**
 * Send weekly film-import report via Resend HTTP API.
 * Chosen because the project has no app-owned mailer; Resend is a single
 * fetch call with one API key — no SMTP server or heavy SDK required.
 */

import { formatWeeklyImportEmail } from "./film-import-queue.mjs";

/**
 * @param {ReturnType<typeof import("./film-import-queue.mjs").buildRunReport>} report
 * @param {{
 *   apiKey?: string,
 *   to?: string,
 *   from?: string,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export async function sendWeeklyFilmImportEmail(report, options = {}) {
  const apiKey = options.apiKey || process.env.RESEND_API_KEY;
  const to =
    options.to || process.env.WEEKLY_FILM_IMPORT_REPORT_EMAIL || "";
  const from =
    options.from ||
    process.env.WEEKLY_FILM_IMPORT_EMAIL_FROM ||
    "Resonale <onboarding@resend.dev>";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required to send the weekly import report");
  }
  if (!to.trim()) {
    throw new Error(
      "WEEKLY_FILM_IMPORT_REPORT_EMAIL is required to send the weekly import report"
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available");
  }

  const { subject, text } = formatWeeklyImportEmail(report);
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to.trim()],
      subject,
      text,
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

  return { subject, to: to.trim() };
}
