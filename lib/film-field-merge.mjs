/**
 * Never-overwrite helpers for film field updates.
 * Only empty / missing target fields may receive a patch value.
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNonEmptyFilmField(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

/**
 * Build an update patch that only fills fields currently empty on `existing`.
 * Does not mutate inputs.
 *
 * @param {Record<string, unknown> | null | undefined} existing
 * @param {Record<string, unknown> | null | undefined} patch
 * @returns {Record<string, unknown>}
 */
export function mergeFilmFieldsNoOverwrite(existing, patch) {
  const base = existing && typeof existing === "object" ? existing : {};
  const incoming = patch && typeof patch === "object" ? patch : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    if (isNonEmptyFilmField(base[key])) continue;
    if (!isNonEmptyFilmField(value) && value !== false && value !== 0) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Assert that no previously non-empty field in `before` changed in `after`.
 *
 * @param {Record<string, unknown> | null | undefined} before
 * @param {Record<string, unknown> | null | undefined} after
 * @param {string[]} [fields]
 * @returns {{ ok: true } | { ok: false, field: string }}
 */
export function assertNoOverwrite(before, after, fields) {
  const keys =
    fields ??
    Object.keys(before && typeof before === "object" ? before : {});
  for (const field of keys) {
    const prev = before?.[field];
    if (!isNonEmptyFilmField(prev)) continue;
    const next = after?.[field];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      return { ok: false, field };
    }
  }
  return { ok: true };
}
