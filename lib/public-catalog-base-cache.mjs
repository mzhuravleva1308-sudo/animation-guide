/**
 * Policy for the public catalog base payload around Next `unstable_cache`.
 *
 * `unstable_cache` persists any fulfilled return value for `revalidate` seconds.
 * Our loader historically returned `{ films: [], loadError: "..." }` on Supabase
 * failures — that empty+error payload was cached and kept `/` empty until expiry.
 *
 * Successful empty catalogs (`films: []`, `loadError: null`) remain cacheable.
 */

export const PUBLIC_CATALOG_BASE_LOAD_ERROR_NAME = "PublicCatalogBaseLoadError";

/**
 * @typedef {{
 *   films: unknown[],
 *   awardWinningFilmIds?: unknown[],
 *   loadError: string | null,
 *   filmsMs?: number,
 *   awardIdsMs?: number,
 *   festivalBadgesMs?: number,
 * }} PublicCatalogBaseResult
 */

/**
 * @param {PublicCatalogBaseResult} result
 * @returns {boolean}
 */
export function isCacheablePublicCatalogBase(result) {
  return result != null && !result.loadError;
}

/**
 * Throw when `result` must not be stored by `unstable_cache`.
 * Attach the full payload so callers can still serve this request.
 *
 * @param {PublicCatalogBaseResult} result
 * @returns {PublicCatalogBaseResult}
 */
export function assertCacheablePublicCatalogBase(result) {
  if (isCacheablePublicCatalogBase(result)) {
    return result;
  }

  const error = new Error(
    result?.loadError || "Public catalog base load failed"
  );
  error.name = PUBLIC_CATALOG_BASE_LOAD_ERROR_NAME;
  error.publicCatalogBase = result;
  throw error;
}

/**
 * @param {unknown} error
 * @returns {error is Error & { publicCatalogBase: PublicCatalogBaseResult }}
 */
export function isPublicCatalogBaseLoadError(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      /** @type {{ name?: string }} */ (error).name ===
        PUBLIC_CATALOG_BASE_LOAD_ERROR_NAME &&
      "publicCatalogBase" in error
  );
}

/**
 * In-memory stand-in for `unstable_cache` used by unit tests:
 * stores successful returns only; thrown failures are not persisted.
 *
 * @template T
 * @param {() => Promise<T>} load
 * @param {{ get: () => T | undefined, set: (value: T) => void }} cache
 * @returns {Promise<T>}
 */
export async function runWithSuccessOnlyCache(load, cache) {
  const hit = cache.get();
  if (hit !== undefined) {
    return hit;
  }

  const value = await load();
  cache.set(value);
  return value;
}

/**
 * Load public catalog base through a success-only cache boundary.
 * Mirrors production: assertCacheable inside the cached callback; on failure
 * return the error payload for this request without writing the cache.
 *
 * @param {() => Promise<PublicCatalogBaseResult>} loadUncached
 * @param {{ get: () => PublicCatalogBaseResult | undefined, set: (value: PublicCatalogBaseResult) => void }} cache
 * @returns {Promise<PublicCatalogBaseResult>}
 */
export async function loadPublicCatalogBaseWithSuccessOnlyCache(
  loadUncached,
  cache
) {
  try {
    return await runWithSuccessOnlyCache(async () => {
      return assertCacheablePublicCatalogBase(await loadUncached());
    }, cache);
  } catch (error) {
    if (isPublicCatalogBaseLoadError(error)) {
      return error.publicCatalogBase;
    }
    throw error;
  }
}
