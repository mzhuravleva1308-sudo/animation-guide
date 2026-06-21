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

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} filmIds
 */
export async function loadFilmFestivalRecognitionsByFilmIds(supabase, filmIds) {
  if (filmIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("film_festival_recognitions")
    .select(FILM_FESTIVAL_RECOGNITION_FIELDS)
    .in("film_id", filmIds)
    .order("festival_year", { ascending: false, nullsFirst: false })
    .order("recognition_type", { ascending: true });

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
