/**
 * Refresh films.watch_availability from TMDB when stale.
 */
import {
  buildWatchAvailabilityFromTmdbResults,
  isWatchAvailabilityStale,
  normalizeWatchAvailability,
} from "./film-watch-availability.mjs";

/**
 * @param {object} input
 * @param {import("@supabase/supabase-js").SupabaseClient} input.admin
 * @param {string} input.filmId
 * @param {string} input.tmdbApiKey
 * @param {boolean} [input.force]
 * @param {typeof fetch} [input.fetchImpl]
 */
export async function refreshFilmWatchAvailability(input) {
  const fetchImpl = input.fetchImpl ?? fetch;
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

  const url = new URL(
    `https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers`
  );
  url.searchParams.set("api_key", input.tmdbApiKey);
  const response = await fetchImpl(url);
  if (response.status === 404) {
    const empty = buildWatchAvailabilityFromTmdbResults(
      {},
      { tmdbId, checkedAt: new Date().toISOString() }
    );
    empty.apple_links = current?.apple_links ?? null;
    empty.mubi_links = current?.mubi_links ?? null;
    const { error: updateError } = await input.admin
      .from("films")
      .update({ watch_availability: empty })
      .eq("id", film.id);
    if (updateError) throw new Error(updateError.message);
    return {
      ok: true,
      status: 200,
      refreshed: true,
      watch_availability: empty,
    };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `TMDB watch/providers ${tmdbId}: ${response.status} ${text.slice(0, 120)}`
    );
  }

  const payload = await response.json();
  const next = buildWatchAvailabilityFromTmdbResults(payload.results ?? {}, {
    tmdbId,
    checkedAt: new Date().toISOString(),
  });
  // Keep one-shot deep links across TMDB refreshes.
  next.apple_links = current?.apple_links ?? null;
  next.mubi_links = current?.mubi_links ?? null;

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
