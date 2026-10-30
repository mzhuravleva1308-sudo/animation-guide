/**
 * Apply poster-compare decisions for pending discovery near-dupes:
 * - same poster → auto-reject
 * - different posters → no reject (classification sends them to looks_good when
 *   that was the only attention reason)
 */

import { DISCOVERY_REVIEW_STATUS } from "./film-discovery.mjs";
import {
  buildSamePosterAutoRejectReason,
  samePosterNearDuplicates,
} from "./film-discovery-pending-review.mjs";
import { buildRejectCandidatePatch } from "./film-discovery-workflow.mjs";

/**
 * @param {object} supabase
 * @param {object[]} candidates — pending rows already enriched with poster_similarity
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<{
 *   rejected: Array<{ id: string, title: string, year: number, reason: string }>,
 *   skipped: number,
 * }>}
 */
export async function autoRejectSamePosterNearDuplicates(
  supabase,
  candidates,
  options = {}
) {
  const dryRun = Boolean(options.dryRun);
  /** @type {Array<{ id: string, title: string, year: number, reason: string }>} */
  const rejected = [];
  let skipped = 0;

  for (const row of candidates ?? []) {
    if (row?.review_status !== DISCOVERY_REVIEW_STATUS.pendingReview) {
      skipped += 1;
      continue;
    }
    const same = samePosterNearDuplicates(row.possible_catalog_duplicates);
    if (same.length === 0) {
      skipped += 1;
      continue;
    }

    const reason = buildSamePosterAutoRejectReason(row, same);
    const patch = buildRejectCandidatePatch(row, reason);

    if (!dryRun) {
      const { data, error } = await supabase
        .from("film_discovery_candidates")
        .update(patch)
        .eq("id", row.id)
        .eq("review_status", DISCOVERY_REVIEW_STATUS.pendingReview)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        skipped += 1;
        continue;
      }
    }

    rejected.push({
      id: row.id,
      title: row.title ?? "(untitled)",
      year: row.year,
      reason,
    });
  }

  return { rejected, skipped };
}
