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

/** Keep `.in(film_id, …)` under typical reverse-proxy URL limits. */
const FILM_ID_IN_BATCH_SIZE = 80;

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string[]} [filmIds]
 */
export async function loadPublicFestivalClaimsByFilmIds(supabase, filmIds) {
  /** @type {Record<string, unknown>[]} */
  const rows = [];

  if (!filmIds?.length) {
    const { data, error } = await supabase
      .from("film_festival_claims")
      .select(PUBLIC_FESTIVAL_CLAIM_FIELDS);

    if (error) {
      throw error;
    }

    rows.push(...(data ?? []));
  } else {
    for (let i = 0; i < filmIds.length; i += FILM_ID_IN_BATCH_SIZE) {
      const batch = filmIds.slice(i, i + FILM_ID_IN_BATCH_SIZE);
      const { data, error } = await supabase
        .from("film_festival_claims")
        .select(PUBLIC_FESTIVAL_CLAIM_FIELDS)
        .in("film_id", batch);

      if (error) {
        throw error;
      }

      rows.push(...(data ?? []));
    }
  }

  /** @type {Map<string, Record<string, unknown>[]>} */
  const grouped = new Map();

  for (const row of rows) {
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
