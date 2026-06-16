import {
  applyNormalizedFields,
  findFilmDuplicates,
  shouldBlockInsert,
} from "./film-duplicate-check.mjs";

const FILM_IDENTITY_FIELDS =
  "id, title, original_title, director, year, country, duration_minutes, source_url, watch_url, trailer_url, tmdb_id, imdb_id";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {import("./film-duplicate-check.types").FilmIdentity} incoming
 */
export async function fetchDuplicateCandidates(supabase, incoming) {
  if (incoming.year != null) {
    const years = [incoming.year - 1, incoming.year, incoming.year + 1];
    const { data, error } = await supabase
      .from("films")
      .select(FILM_IDENTITY_FIELDS)
      .in("year", years);

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  const { data, error } = await supabase
    .from("films")
    .select(FILM_IDENTITY_FIELDS);

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {import("./film-duplicate-check.types").FilmIdentity} incoming
 */
export async function checkFilmDuplicates(supabase, incoming) {
  const candidates = await fetchDuplicateCandidates(supabase, incoming);
  const matches = findFilmDuplicates(incoming, candidates);

  return {
    incomingFilm: incoming,
    matches,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>} film
 * @param {{
 *   allowPossibleDuplicates?: boolean,
 *   forceExactDuplicate?: boolean,
 * }} [options]
 */
export async function insertFilmWithDuplicateCheck(supabase, film, options = {}) {
  const incoming = {
    title: String(film.title ?? ""),
    original_title: film.original_title ?? null,
    director: film.director ?? null,
    year: film.year ?? null,
    country: film.country ?? null,
    duration_minutes: film.duration_minutes ?? null,
    source_url: film.source_url ?? null,
    watch_url: film.watch_url ?? null,
    trailer_url: film.trailer_url ?? null,
    tmdb_id: film.tmdb_id ?? null,
    imdb_id: film.imdb_id ?? null,
  };

  const { matches } = await checkFilmDuplicates(supabase, incoming);
  const blockResult = shouldBlockInsert(matches, options);

  if (blockResult.blocked) {
    return {
      inserted: false,
      blocked: true,
      reason: blockResult.reason,
      matches: blockResult.matches,
      incomingFilm: incoming,
    };
  }

  const payload = applyNormalizedFields(film);
  const { data, error } = await supabase
    .from("films")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    inserted: true,
    blocked: false,
    film: data,
    matches,
    incomingFilm: incoming,
  };
}

/**
 * @param {{ matches: import("./film-duplicate-check.types").DuplicateMatch[], incomingFilm: import("./film-duplicate-check.types").FilmIdentity }} report
 */
export function formatDuplicateReport(report) {
  const lines = [];

  for (const match of report.matches) {
    const existing = match.existingFilm;
    lines.push(
      [
        `score=${Math.round(match.score)}`,
        match.isHardDuplicate ? "hard" : "possible",
        `reasons=${match.reasons.join("; ")}`,
        `existing="${existing.title}" (${existing.year ?? "unknown year"})`,
      ].join(" | ")
    );
  }

  return lines.join("\n");
}
