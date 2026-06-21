/** Claim statuses excluded from public festival badges. */
export const PUBLIC_FESTIVAL_CLAIM_EXCLUDED_STATUSES = [
  "rejected_after_verification",
  "blocked_or_incomplete",
  "not_at_festival",
];

export const PUBLIC_FESTIVAL_CLAIM_FIELDS = [
  "film_id",
  "canonical_festival_id",
  "raw_festival_name",
  "claim_status",
].join(", ");

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} [filmIds]
 */
export async function loadPublicFestivalClaimsByFilmIds(supabase, filmIds) {
  let query = supabase
    .from("film_festival_claims")
    .select(PUBLIC_FESTIVAL_CLAIM_FIELDS);

  if (filmIds?.length) {
    query = query.in("film_id", filmIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  /** @type {Map<string, Record<string, unknown>[]>} */
  const grouped = new Map();

  for (const row of data ?? []) {
    if (PUBLIC_FESTIVAL_CLAIM_EXCLUDED_STATUSES.includes(String(row.claim_status))) {
      continue;
    }

    const filmId = String(row.film_id);
    const bucket = grouped.get(filmId) ?? [];
    bucket.push(row);
    grouped.set(filmId, bucket);
  }

  return grouped;
}
