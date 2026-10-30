/**
 * Poster compare for discovery near-dupe review.
 * Resize both covers to a small grid and score mean absolute error (MAE).
 * Enough to confirm same art vs clearly different without eyeballing every pair.
 */

import sharp from "sharp";
import {
  POSTER_SIMILARITY,
  formatPosterSimilarityLabel,
} from "./poster-similarity-shared.mjs";

export { POSTER_SIMILARITY, formatPosterSimilarityLabel };

/** MAE (0–255 greyscale) ≤ this → same / near-identical art. */
export const POSTER_MAE_SAME_MAX = 10;
/** MAE ≤ this → similar crop/grade; above → different. */
export const POSTER_MAE_SIMILAR_MAX = 28;

const COMPARE_SIZE = 32;

const FETCH_TIMEOUT_MS = 8_000;

/**
 * @param {number} mae
 * @returns {typeof POSTER_SIMILARITY[keyof typeof POSTER_SIMILARITY]}
 */
export function classifyPosterMae(mae) {
  if (!Number.isFinite(mae) || mae < 0) {
    return POSTER_SIMILARITY.unknown;
  }
  if (mae <= POSTER_MAE_SAME_MAX) return POSTER_SIMILARITY.same;
  if (mae <= POSTER_MAE_SIMILAR_MAX) return POSTER_SIMILARITY.similar;
  return POSTER_SIMILARITY.different;
}

/** @deprecated use classifyPosterMae — kept for older call sites/tests */
export function classifyPosterHammingDistance(distance) {
  return classifyPosterMae(distance);
}

/**
 * Greyscale COMPARE_SIZE×COMPARE_SIZE raw pixels.
 * @param {Buffer} imageBuffer
 * @returns {Promise<Uint8Array>}
 */
export async function posterCompareGrid(imageBuffer) {
  const data = await sharp(imageBuffer)
    .rotate()
    .greyscale()
    .resize(COMPARE_SIZE, COMPARE_SIZE, { fit: "fill" })
    .raw()
    .toBuffer();
  return new Uint8Array(data);
}

/**
 * @param {Uint8Array} left
 * @param {Uint8Array} right
 * @returns {number} mean absolute error 0–255
 */
export function meanAbsoluteError(left, right) {
  if (!left?.length || left.length !== right?.length) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  for (let i = 0; i < left.length; i += 1) {
    sum += Math.abs(left[i] - right[i]);
  }
  return sum / left.length;
}

/**
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<Buffer>}
 */
export async function fetchPosterBuffer(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "ResonalePosterCompare/1.0",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`Poster fetch failed (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string | null | undefined} leftUrl
 * @param {string | null | undefined} rightUrl
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{
 *   verdict: typeof POSTER_SIMILARITY[keyof typeof POSTER_SIMILARITY],
 *   distance: number | null,
 *   error?: string,
 * }>}
 */
export async function comparePosterUrls(leftUrl, rightUrl, options = {}) {
  const left =
    typeof leftUrl === "string" && leftUrl.trim() ? leftUrl.trim() : "";
  const right =
    typeof rightUrl === "string" && rightUrl.trim() ? rightUrl.trim() : "";
  if (!left || !right) {
    return { verdict: POSTER_SIMILARITY.unknown, distance: null };
  }
  if (left === right) {
    return { verdict: POSTER_SIMILARITY.same, distance: 0 };
  }

  try {
    const [leftBuf, rightBuf] = await Promise.all([
      fetchPosterBuffer(left, options),
      fetchPosterBuffer(right, options),
    ]);
    const [leftGrid, rightGrid] = await Promise.all([
      posterCompareGrid(leftBuf),
      posterCompareGrid(rightBuf),
    ]);
    const distance = meanAbsoluteError(leftGrid, rightGrid);
    return {
      verdict: classifyPosterMae(distance),
      distance: Math.round(distance * 10) / 10,
    };
  } catch (error) {
    return {
      verdict: POSTER_SIMILARITY.unknown,
      distance: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Attach poster_similarity onto each possible_catalog_duplicates match.
 * Only pending_review rows with a candidate poster + matches are compared.
 *
 * @template {object} T
 * @param {T[]} candidates
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   concurrency?: number,
 *   onlyPendingReview?: boolean,
 * }} [options]
 * @returns {Promise<T[]>}
 */
export async function enrichNearDuplicatesWithPosterSimilarity(
  candidates,
  options = {}
) {
  const onlyPending = options.onlyPendingReview !== false;
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const rows = candidates ?? [];

  /** @type {Array<{ rowIndex: number, matchIndex: number, left: string, right: string }>} */
  const jobs = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (onlyPending && row?.review_status !== "pending_review") continue;
    const left =
      typeof row?.poster_url === "string" ? row.poster_url.trim() : "";
    const matches = Array.isArray(row?.possible_catalog_duplicates)
      ? row.possible_catalog_duplicates
      : [];
    if (!left || matches.length === 0) continue;

    for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
      const right =
        typeof matches[matchIndex]?.poster_url === "string"
          ? matches[matchIndex].poster_url.trim()
          : "";
      if (!right) {
        matches[matchIndex] = {
          ...matches[matchIndex],
          poster_similarity: POSTER_SIMILARITY.unknown,
          poster_distance: null,
        };
        continue;
      }
      jobs.push({ rowIndex, matchIndex, left, right });
    }
  }

  for (let i = 0; i < jobs.length; i += concurrency) {
    const chunk = jobs.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map((job) => comparePosterUrls(job.left, job.right, options))
    );
    for (let j = 0; j < chunk.length; j += 1) {
      const job = chunk[j];
      const result = results[j];
      const matches = rows[job.rowIndex].possible_catalog_duplicates;
      matches[job.matchIndex] = {
        ...matches[job.matchIndex],
        poster_similarity: result.verdict,
        poster_distance: result.distance,
      };
    }
  }

  return rows;
}
