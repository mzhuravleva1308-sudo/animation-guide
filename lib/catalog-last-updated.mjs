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
 * @param {string | null | undefined} iso
 * @param {"long" | "short"} month
 * @returns {{ month: string, year: number } | null}
 */
function catalogUpdatedParts(iso, month) {
  if (typeof iso !== "string" || !iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    month: date.toLocaleString("en-US", {
      month,
      timeZone: "UTC",
    }),
    year: date.getUTCFullYear(),
  };
}

/**
 * Full footer label in UTC (weekly import job is UTC).
 * @param {string | null | undefined} iso
 * @returns {string | null}
 */
export function formatCatalogUpdatedLabel(iso) {
  const parts = catalogUpdatedParts(iso, "long");
  return parts ? `Catalog updated ${parts.month} ${parts.year}` : null;
}

/**
 * Short label for the catalog film-count row, e.g. "Updated Mar 2026".
 * @param {string | null | undefined} iso
 * @returns {string | null}
 */
export function formatCatalogUpdatedShortLabel(iso) {
  const parts = catalogUpdatedParts(iso, "short");
  return parts ? `Updated ${parts.month} ${parts.year}` : null;
}
