/**
 * Batch Go Live: catalog_visible=true for selected prepped films + one profile rebuild enqueue.
 */

import { mergeReleaseChecklist } from "./discovery-to-import-payload.mjs";
import { DISCOVERY_RELEASE_STATUS } from "./discovery-to-import-payload.mjs";
import { isCachedPosterUrl } from "./film-poster.mjs";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object[]} profiles
 */
export async function enqueueAllProfileScoreRebuilds(supabase, profiles) {
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("profile_score_rebuild_jobs")
    .select("profile_id,generation")
    .in(
      "profile_id",
      profiles.map((profile) => profile.id)
    );
  if (existingError) throw existingError;

  const generationById = new Map(
    (existing ?? []).map((job) => [
      job.profile_id,
      Number(job.generation) + 1,
    ])
  );

  const rows = profiles.map((profile) => ({
    profile_id: profile.id,
    scheduled_at: now,
    status: "pending",
    generation: generationById.get(profile.id) ?? 1,
    attempts: 0,
    locked_at: null,
    last_error: null,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("profile_score_rebuild_jobs")
    .upsert(rows, { onConflict: "profile_id" });
  if (error) throw error;
  return rows;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} filmIds
 * @param {{ actor?: string | null, notes?: string | null, supabaseUrl?: string }} [options]
 */
export async function goLiveFilmBatch(supabase, filmIds, options = {}) {
  const ids = [...new Set((filmIds ?? []).filter(Boolean))];
  if (!ids.length) {
    throw new Error("Go live requires at least one film id");
  }

  const { data: films, error: filmsError } = await supabase
    .from("films")
    .select(
      "id,title,year,catalog_visible,poster_url,moods,aesthetic_tags,synopsis,the_mood,technique"
    )
    .in("id", ids);
  if (filmsError) throw filmsError;

  const found = films ?? [];
  const foundIds = new Set(found.map((film) => film.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length) {
    throw new Error(`Films not found: ${missing.join(", ")}`);
  }

  const notReady = found.filter((film) => {
    if (!isCachedPosterUrl(film.poster_url, options.supabaseUrl)) return true;
    if (!Array.isArray(film.moods) || !film.moods.length) return true;
    if (!Array.isArray(film.aesthetic_tags) || !film.aesthetic_tags.length) {
      return true;
    }
    return false;
  });
  if (notReady.length) {
    throw new Error(
      `Not ready for go-live (need Storage poster + moods + aesthetic_tags): ${notReady
        .map((film) => film.title)
        .join(", ")}`
    );
  }

  const { data: moodEmb, error: moodEmbError } = await supabase
    .from("film_mood_embeddings")
    .select("film_id")
    .in("film_id", ids);
  if (moodEmbError) throw moodEmbError;
  const { data: aestheticEmb, error: aestheticEmbError } = await supabase
    .from("film_aesthetic_embeddings")
    .select("film_id")
    .in("film_id", ids);
  if (aestheticEmbError) throw aestheticEmbError;

  const moodSet = new Set((moodEmb ?? []).map((row) => row.film_id));
  const aestheticSet = new Set((aestheticEmb ?? []).map((row) => row.film_id));
  const missingEmb = found.filter(
    (film) => !moodSet.has(film.id) || !aestheticSet.has(film.id)
  );
  if (missingEmb.length) {
    throw new Error(
      `Not ready for go-live (missing embeddings): ${missingEmb
        .map((film) => film.title)
        .join(", ")}`
    );
  }

  const toReveal = found.filter((film) => film.catalog_visible === false);
  if (toReveal.length) {
    const { error: updateError } = await supabase
      .from("films")
      .update({ catalog_visible: true })
      .in(
        "id",
        toReveal.map((film) => film.id)
      )
      .eq("catalog_visible", false);
    if (updateError) throw updateError;
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,slug,name")
    .order("slug");
  if (profilesError) throw profilesError;

  const jobs = await enqueueAllProfileScoreRebuilds(supabase, profiles ?? []);

  const { data: batch, error: batchError } = await supabase
    .from("film_release_batches")
    .insert({
      film_ids: ids,
      actor: options.actor ?? null,
      notes: options.notes ?? null,
      profile_scores_enqueued: true,
    })
    .select("id,created_at")
    .single();
  if (batchError) throw batchError;

  const releasedAt = new Date().toISOString();

  const { data: queueRows } = await supabase
    .from("film_import_queue")
    .select("id,film_id,result_checklist,discovery_candidate_id")
    .in("film_id", ids);

  for (const row of queueRows ?? []) {
    const checklist = mergeReleaseChecklist(row.result_checklist, {
      catalog_visible: true,
      profile_scores: "enqueued",
      released_at: releasedAt,
      release_batch_id: batch.id,
    });
    await supabase
      .from("film_import_queue")
      .update({
        result_checklist: checklist,
        updated_at: releasedAt,
      })
      .eq("id", row.id);
  }

  const { data: candidates } = await supabase
    .from("film_discovery_candidates")
    .select("id")
    .in("film_id", ids);

  const candidateIds = (candidates ?? []).map((row) => row.id);
  if (candidateIds.length) {
    await supabase
      .from("film_discovery_candidates")
      .update({
        release_status: DISCOVERY_RELEASE_STATUS.released,
        updated_at: releasedAt,
      })
      .in("id", candidateIds);

    await supabase
      .from("film_release_batches")
      .update({
        candidate_ids: candidateIds,
        queue_ids: (queueRows ?? []).map((row) => row.id),
      })
      .eq("id", batch.id);
  }

  return {
    batchId: batch.id,
    filmIds: ids,
    revealedCount: toReveal.length,
    alreadyVisibleCount: found.length - toReveal.length,
    profileJobs: jobs.length,
    candidateIds,
  };
}
