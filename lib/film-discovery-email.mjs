/**
 * Format weekly film discovery report email (plain text).
 */

import { formatManagerBrief } from "./film-discovery-manager.mjs";

/**
 * @param {object} input
 * @param {import("./film-discovery.mjs").ManagerBrief} input.brief
 * @param {number} input.researchRounds
 * @param {object[]} input.passed
 * @param {Array<{ candidate: object, review: { reasons: string[] } }>} input.failed
 * @param {boolean} input.incomplete
 * @param {string[]} [input.incompleteNotes]
 * @param {Array<{ reason: string, count: number }>} [input.rejectionSummary]
 */
export function formatWeeklyFilmDiscoveryEmail(input) {
  const passedCount = input.passed.length;
  const failedCount = input.failed.length;
  const subject = input.incomplete
    ? `[Resonale] Weekly film discovery — incomplete batch (${passedCount} passed)`
    : `[Resonale] Weekly film discovery — ${passedCount} candidates for review`;

  const lines = [
    "Resonale weekly film discovery report",
    "",
    `Research rounds used: ${input.researchRounds}`,
    `Passed eligibility: ${passedCount}`,
    `Rejected: ${failedCount}`,
    `Batch complete: ${input.incomplete ? "NO (incomplete)" : "YES"}`,
    "",
    "=== Manager brief ===",
    formatManagerBrief(input.brief),
    "",
  ];

  if (input.incomplete) {
    lines.push("=== Incomplete batch notes ===");
    for (const note of input.incompleteNotes ?? []) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  if ((input.rejectionSummary ?? []).length > 0) {
    lines.push("=== Main rejection reasons ===");
    for (const entry of input.rejectionSummary) {
      lines.push(`- (${entry.count}) ${entry.reason}`);
    }
    lines.push("");
  }

  lines.push("=== Passed candidates (pending manual approve/reject) ===");
  if (input.passed.length === 0) {
    lines.push("(none)");
  } else {
    input.passed.forEach((film, index) => {
      lines.push("");
      lines.push(`${index + 1}. ${film.title} (${film.year})`);
      lines.push(`   Original title: ${film.original_title ?? "—"}`);
      lines.push(`   Directors: ${(film.directors ?? []).join(", ") || "—"}`);
      lines.push(`   Countries: ${(film.countries ?? []).join(", ") || "—"}`);
      lines.push(`   Runtime: ${film.runtime_minutes ?? "—"} min`);
      lines.push(`   Manager why: ${film.manager_why ?? "—"}`);
      lines.push(`   Researcher why: ${film.researcher_why ?? "—"}`);
      lines.push(`   Eligibility: ${film.eligibility_result ?? "PASS"}`);
      lines.push(`   Media status: ${film.media_status ?? "media_pending"}`);
      if (film.media_notes) {
        lines.push(`   Media notes: ${film.media_notes}`);
      }
      lines.push(`   Poster: ${film.poster_url ?? "—"}`);
      if (film.poster_source_label) {
        lines.push(`   Poster source: ${film.poster_source_label}`);
      }
      lines.push(`   Trailer: ${film.trailer_url ?? "—"}`);
      if (film.trailer_source_label) {
        lines.push(`   Trailer source: ${film.trailer_source_label}`);
      }
      lines.push("   Sources:");
      for (const url of film.source_urls ?? []) {
        lines.push(`   - ${url}`);
      }
    });
  }

  lines.push("");
  lines.push(
    "Next step: open /admin/film-discovery to review poster, trailer, and Approve or Reject."
  );
  lines.push(
    "Approve does NOT publish, enrich, download posters, or create synopsis."
  );

  return { subject, text: lines.join("\n") };
}

/**
 * @param {ReturnType<typeof formatWeeklyFilmDiscoveryEmail> extends infer R ? any : never} _report
 */
export function formatWeeklyFilmDiscoveryEmailSubject(report) {
  return report.email?.subject ?? report.subject ?? "[Resonale] Weekly film discovery";
}
