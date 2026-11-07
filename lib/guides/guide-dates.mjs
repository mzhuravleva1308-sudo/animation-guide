/**
 * Format a guide YYYY-MM-DD date for UI, e.g. "Updated November 7, 2026".
 *
 * @param {string | null | undefined} isoDate
 * @returns {string | null}
 */
export function formatGuideUpdatedLabel(isoDate) {
  const raw = String(isoDate ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const formatted = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `Updated ${formatted}`;
}
