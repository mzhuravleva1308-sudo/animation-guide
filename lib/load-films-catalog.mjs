export const CATALOG_ANALYTICS_FILM_FIELDS = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "festival",
  "section",
  "source_url",
  "image_url",
  "poster_url",
  "external_image_url",
  "technique",
  "moods",
  "aesthetic_tags",
  "narrative_tags",
  "synopsis",
].join(", ");

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function loadFilmsForCatalogAnalytics(supabase) {
  const { data, error } = await supabase
    .from("films")
    .select(CATALOG_ANALYTICS_FILM_FIELDS)
    .order("id");

  if (error) {
    throw error;
  }

  return data ?? [];
}
