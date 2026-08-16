/**
 * After admin approve: map discovery candidate → import queue (prep, hidden).
 */

import {
  buildDiscoveryReleasePayload,
  buildInitialReleaseChecklist,
  DISCOVERY_RELEASE_ORIGIN,
  DISCOVERY_RELEASE_STATUS,
} from "./discovery-to-import-payload.mjs";
import {
  ENQUEUE_RESULT,
  enqueueOneFilm,
} from "./film-import-enqueue.mjs";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} candidate — full film_discovery_candidates row
 * @param {{ tmdbId?: number | null, replaceActive?: boolean }} [options]
 */
export async function enqueueDiscoveryCandidateForRelease(
  supabase,
  candidate,
  options = {}
) {
  const mapped = buildDiscoveryReleasePayload(candidate, {
    tmdbId: options.tmdbId ?? null,
  });

  if (!mapped.ready || !mapped.payload) {
    const { error } = await supabase
      .from("film_discovery_candidates")
      .update({
        release_status: DISCOVERY_RELEASE_STATUS.blocked,
        release_blockers: mapped.blockers,
        release_queue_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.id);
    if (error) throw error;
    return {
      status: "blocked",
      blockers: mapped.blockers,
      warnings: [],
      queueId: null,
      payload: null,
    };
  }

  const checklist = buildInitialReleaseChecklist({
    warnings: mapped.warnings,
    preserved: {
      moods: Boolean(mapped.payload.moods?.length),
      aesthetic_tags: Boolean(mapped.payload.aesthetic_tags?.length),
      image: Boolean(mapped.payload.image_url || mapped.payload.external_image_url),
      trailer: Boolean(mapped.payload.trailer_url),
    },
  });

  const enqueueResult = await enqueueOneFilm(supabase, mapped.payload, {
    replaceActive: Boolean(options.replaceActive),
    origin: DISCOVERY_RELEASE_ORIGIN,
    discoveryCandidateId: candidate.id,
    resultChecklist: checklist,
    skipCatalogAdvisory: false,
  });

  const queueId = enqueueResult.row?.id ?? enqueueResult.existingId ?? null;
  const queued =
    enqueueResult.status === ENQUEUE_RESULT.ADDED ||
    enqueueResult.status === ENQUEUE_RESULT.REPLACED_ACTIVE ||
    enqueueResult.status === ENQUEUE_RESULT.SKIPPED_ALREADY_QUEUED;

  const { error: candidateError } = await supabase
    .from("film_discovery_candidates")
    .update({
      release_status: queued
        ? DISCOVERY_RELEASE_STATUS.queued
        : DISCOVERY_RELEASE_STATUS.blocked,
      release_blockers: [],
      release_queue_id: queueId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id);
  if (candidateError) throw candidateError;

  return {
    status: enqueueResult.status,
    blockers: [],
    warnings: mapped.warnings,
    queueId,
    payload: mapped.payload,
    enqueueResult,
    catalogNote: enqueueResult.catalogNote ?? null,
  };
}
