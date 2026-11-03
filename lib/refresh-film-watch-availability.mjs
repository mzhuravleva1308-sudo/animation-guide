/**
 * Refresh films.watch_availability from TMDB when stale.
 *
 * On-open product refresh stays disabled; import + missing-only weekly sync
 * use loadWatchAvailabilityFromTmdb directly.
 */
import {
  isWatchAvailabilityStale,
  normalizeWatchAvailability,
} from "./film-watch-availability.mjs";
import { loadWatchAvailabilityFromTmdb } from "./tmdb-watch-providers.mjs";

/**
 * @param {object} input
 * @param {import("@supabase/supabase-js").SupabaseClient} input.admin
 * @param {string} input.filmId
 * @param {string} input.tmdbApiKey
 * @param {boolean} [input.force]
 * @param {typeof fetch} [input.fetchImpl]
 */
export async function refreshFilmWatchAvailability(input) {
  const { data: film, error } = await input.admin
    .from("films")
    .select("id, tmdb_id, watch_availability")
    .eq("id", input.filmId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!film) {
    return { ok: false, status: 404, error: "Film not found" };
  }

  const current = normalizeWatchAvailability(film.watch_availability);
  if (
    !input.force &&
    current &&
    !isWatchAvailabilityStale(current.checked_at)
  ) {
    return {
      ok: true,
      status: 200,
      refreshed: false,
      watch_availability: current,
    };
  }

  const tmdbId =
    film.tmdb_id != null
      ? Number(film.tmdb_id)
      : current?.tmdb_id != null
        ? Number(current.tmdb_id)
        : null;

  if (tmdbId == null || !Number.isFinite(tmdbId)) {
    return {
      ok: false,
      status: 422,
      error: "Film has no TMDB id",
      watch_availability: current,
    };
  }

  const next = await loadWatchAvailabilityFromTmdb({
    tmdbId,
    apiKey: input.tmdbApiKey,
    current,
    fetchImpl: input.fetchImpl,
  });

  const { error: updateError } = await input.admin
    .from("films")
    .update({ watch_availability: next })
    .eq("id", film.id);
  if (updateError) throw new Error(updateError.message);

  return {
    ok: true,
    status: 200,
    refreshed: true,
    watch_availability: next,
  };
}
