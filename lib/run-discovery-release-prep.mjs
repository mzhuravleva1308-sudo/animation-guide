/**
 * Start discovery-release prep for one queue row (same pipeline as weekly import).
 */

import { processFilmImportQueueItemById } from "./film-import-queue.mjs";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} queueId
 * @param {{ processFilmImportBatch?: Function }} [options]
 */
export async function runDiscoveryReleasePrepForQueueId(
  supabase,
  queueId,
  options = {}
) {
  if (!queueId) {
    throw new Error("runDiscoveryReleasePrepForQueueId requires queueId");
  }

  const processFilmImportBatch =
    options.processFilmImportBatch ??
    (await import("../scripts/process-film-batch.mjs")).processFilmImportBatch;

  console.log(`[discovery-release-prep] starting queueId=${queueId}`);
  const result = await processFilmImportQueueItemById({
    supabase,
    queueId,
    processFilmImportBatch,
  });
  console.log(
    `[discovery-release-prep] finished queueId=${queueId} skipped=${Boolean(
      result.skipped
    )} status=${result.queueUpdate?.status ?? result.reason ?? "?"}`
  );
  return result;
}
