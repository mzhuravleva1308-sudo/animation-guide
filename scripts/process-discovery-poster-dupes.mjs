#!/usr/bin/env node
/**
 * For pending_review discovery candidates with title/year near-catalog matches:
 * compare posters, auto-reject same-poster dupes.
 * Different posters stay pending; attention classification treats them as cleared
 * so otherwise-complete cards land in Looks good.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/process-discovery-poster-dupes.mjs --dry-run
 *   APP_ENV=hosted node scripts/process-discovery-poster-dupes.mjs --confirm
 */

import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { DISCOVERY_REVIEW_STATUS } from "../lib/film-discovery.mjs";
import {
  annotateDiscoveryCandidatesWithNearDuplicates,
  classifyDiscoveryPendingReview,
  nearDuplicatesClearedByDifferentPosters,
  samePosterNearDuplicates,
} from "../lib/film-discovery-pending-review.mjs";
import { autoRejectSamePosterNearDuplicates } from "../lib/film-discovery-poster-dupe-actions.mjs";
import { enrichNearDuplicatesWithPosterSimilarity } from "../lib/poster-similarity.mjs";

applyAppEnv();

function parseArgs(argv) {
  const options = { dryRun: false, confirm: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--confirm") options.confirm = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.dryRun && !options.confirm) {
    throw new Error("Pass --dry-run or --confirm");
  }
  return options;
}

async function loadAll(supabase, table, columns, orderColumn = "id") {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) break;
  }
  return rows;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase admin env");
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const pending = (
    await loadAll(
      supabase,
      "film_discovery_candidates",
      "id, title, original_title, year, poster_url, trailer_url, media_status, content_status, moods, aesthetic_tags, storytelling_tags, has_festival, review_status, eligibility_evidence, film_id, created_at",
      "created_at"
    )
  ).filter((row) => row.review_status === DISCOVERY_REVIEW_STATUS.pendingReview);

  const catalog = await loadAll(
    supabase,
    "films",
    "id, title, original_title, year, normalized_title, normalized_original_title, poster_url, image_url",
    "id"
  );

  console.log(
    JSON.stringify(
      {
        pending: pending.length,
        catalog: catalog.length,
        mode: options.dryRun ? "dry-run" : "confirm",
      },
      null,
      2
    )
  );

  const annotated = annotateDiscoveryCandidatesWithNearDuplicates(
    pending,
    catalog
  );
  const withNearDupes = annotated.filter(
    (row) => (row.possible_catalog_duplicates ?? []).length > 0
  );
  console.log(`near-dupe suspects: ${withNearDupes.length}`);

  const enriched = await enrichNearDuplicatesWithPosterSimilarity(withNearDupes, {
    onlyPendingReview: true,
    concurrency: 4,
  });

  const same = [];
  const different = [];
  const other = [];
  for (const row of enriched) {
    const matches = row.possible_catalog_duplicates ?? [];
    if (samePosterNearDuplicates(matches).length) {
      same.push(row);
    } else if (nearDuplicatesClearedByDifferentPosters(matches)) {
      different.push(row);
    } else {
      other.push(row);
    }
  }

  const looksGoodAfterDifferent = different.filter((row) => {
    const { bucket } = classifyDiscoveryPendingReview(row);
    return bucket === "looks_good";
  });

  console.log(
    JSON.stringify(
      {
        samePoster: same.map((r) => `${r.title} (${r.year})`),
        differentPosters: different.map((r) => `${r.title} (${r.year})`),
        differentPostersLooksGood: looksGoodAfterDifferent.length,
        unresolvedNearDupes: other.map((r) => `${r.title} (${r.year})`),
      },
      null,
      2
    )
  );

  const { rejected } = await autoRejectSamePosterNearDuplicates(
    supabase,
    same,
    { dryRun: options.dryRun }
  );

  console.log(
    JSON.stringify(
      {
        rejectedCount: rejected.length,
        rejected,
        note: options.dryRun
          ? "Dry run — no rejects written"
          : "Rejected same-poster near-dupes",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
