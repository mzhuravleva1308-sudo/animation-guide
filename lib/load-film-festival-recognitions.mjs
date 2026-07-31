export const FILM_FESTIVAL_RECOGNITION_FIELDS = [
  "id",
  "film_id",
  "festival_name",
  "normalized_festival_name",
  "festival_year",
  "section",
  "recognition_type",
  "award_name",
  "normalized_award_name",
  "award_level",
  "source_url",
  "source_label",
  "source_type",
  "original_text",
  "import_source",
  "import_key",
  "dedupe_key",
  "created_at",
  "updated_at",
].join(", ");

/** Fields needed only to derive public festival badges (not full recognition rows). */
export const PUBLIC_FESTIVAL_RECOGNITION_BADGE_FIELDS = [
  "film_id",
  "festival_name",
].join(", ");

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} filmIds
 * @param {{ fields?: string }} [options]
 */
export async function loadFilmFestivalRecognitionsByFilmIds(
  supabase,
  filmIds,
  options = {}
) {
  if (filmIds.length === 0) {
    return new Map();
  }

  const fields = options.fields ?? FILM_FESTIVAL_RECOGNITION_FIELDS;

  let query = supabase
    .from("film_festival_recognitions")
    .select(fields)
    .in("film_id", filmIds);

  // Full admin rows keep stable ordering; badge-only selects skip order cols.
  if (fields === FILM_FESTIVAL_RECOGNITION_FIELDS) {
    query = query
      .order("festival_year", { ascending: false, nullsFirst: false })
      .order("recognition_type", { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  /** @type {Map<string, Record<string, unknown>[]>} */
  const grouped = new Map();

  for (const row of data ?? []) {
    const filmId = String(row.film_id);
    const existing = grouped.get(filmId) ?? [];
    existing.push(row);
    grouped.set(filmId, existing);
  }

  return grouped;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} filmId
 */
export async function loadFilmFestivalRecognitionsForFilm(supabase, filmId) {
  const grouped = await loadFilmFestivalRecognitionsByFilmIds(supabase, [filmId]);
  return grouped.get(filmId) ?? [];
}
