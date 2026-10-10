/**
 * Public "catalog last updated" stamp: newest moment the public catalog gained
 * titles (visible film insert or Go Live batch), not metadata-only edits.
 */

/**
 * @param {...(string | null | undefined)} values
 * @returns {string | null}
 */
export function maxIsoTimestamps(...values) {
  let maxMs = null;
  let maxIso = null;
  for (const value of values) {
    if (typeof value !== "string" || !value) continue;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) continue;
    if (maxMs == null || ms > maxMs) {
      maxMs = ms;
      maxIso = value;
    }
  }
  return maxIso;
}

/**
 * Month + year in UTC (weekly import job is UTC).
 * @param {string | null | undefined} iso
 * @returns {string | null}
 */
export function formatCatalogUpdatedLabel(iso) {
  if (typeof iso !== "string" || !iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const year = date.getUTCFullYear();
  return `Updated ${month} ${year}`;
}
