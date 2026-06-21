import { FILM_FESTIVAL_RECOGNITION_FIELDS } from "./load-film-festival-recognitions.mjs";

export const FILM_FESTIVAL_CLAIM_FIELDS = [
  "id",
  "film_id",
  "raw_festival_name",
  "canonical_festival_id",
  "festival_year",
  "section",
  "recognition_type",
  "award_name",
  "award_result",
  "source_type",
  "source_url",
  "original_text",
  "claim_status",
  "verification_reason",
  "official_url",
  "discovery_source",
  "dedupe_key",
  "recognition_id",
  "created_at",
  "updated_at",
].join(", ");

/**
 * @typedef {{
 *   id: string,
 *   film_id: string,
 *   raw_festival_name: string,
 *   canonical_festival_id: string | null,
 *   festival_year: number | null,
 *   section: string | null,
 *   recognition_type: string,
 *   award_name: string | null,
 *   source_type: string,
 *   source_url: string | null,
 *   claim_status: string,
 *   verification_reason: string | null,
 *   official_url: string | null,
 *   created_at: string,
 * }} FestivalClaimRow
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   year: number | null,
 * }} FestivalRecognitionFilmRef
 *
 * @typedef {FestivalClaimRow & {
 *   film: FestivalRecognitionFilmRef | null,
 * }} FestivalClaimAdminRow
 *
 * @typedef {{
 *   totalClaims: number,
 *   uniqueFilms: number,
 *   byStatus: Array<{ label: string, count: number }>,
 *   bySourceType: Array<{ label: string, count: number }>,
 * }} FestivalClaimAdminSummary
 */

/**
 * @param {FestivalClaimAdminRow[]} rows
 */
export function summarizeFestivalClaimsAdmin(rows) {
  /** @type {Map<string, number>} */
  const statusCounts = new Map();
  /** @type {Map<string, number>} */
  const sourceTypeCounts = new Map();
  /** @type {Map<string, number>} */
  const festivalCounts = new Map();
  /** @type {Set<string>} */
  const filmIds = new Set();

  for (const row of rows) {
    filmIds.add(row.film_id);
    statusCounts.set(
      row.claim_status,
      (statusCounts.get(row.claim_status) ?? 0) + 1
    );
    sourceTypeCounts.set(
      row.source_type,
      (sourceTypeCounts.get(row.source_type) ?? 0) + 1
    );
    const festivalLabel =
      row.canonical_festival_id ?? row.raw_festival_name ?? "unknown";
    festivalCounts.set(
      festivalLabel,
      (festivalCounts.get(festivalLabel) ?? 0) + 1
    );
  }

  const toSortedEntries = (map) =>
    [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    totalClaims: rows.length,
    uniqueFilms: filmIds.size,
    byStatus: toSortedEntries(statusCounts),
    bySourceType: toSortedEntries(sourceTypeCounts),
    byFestival: toSortedEntries(festivalCounts),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string | null} [canonicalFestivalId] null = all festivals
 */
export async function loadFestivalClaimsAdminData(
  supabase,
  canonicalFestivalId = null
) {
  let query = supabase
    .from("film_festival_claims")
    .select(FILM_FESTIVAL_CLAIM_FIELDS)
    .order("festival_year", { ascending: false, nullsFirst: false })
    .order("claim_status", { ascending: true })
    .order("created_at", { ascending: false });

  if (canonicalFestivalId) {
    query = query.eq("canonical_festival_id", canonicalFestivalId);
  }

  const { data: rows, error } = await query;

  if (error) {
    throw error;
  }

  const claimRows = rows ?? [];
  const filmIds = [...new Set(claimRows.map((row) => String(row.film_id)))];

  /** @type {Map<string, FestivalRecognitionFilmRef>} */
  const filmsById = new Map();

  if (filmIds.length > 0) {
    const { data: films, error: filmsError } = await supabase
      .from("films")
      .select("id, title, year")
      .in("id", filmIds);

    if (filmsError) {
      throw filmsError;
    }

    for (const film of films ?? []) {
      filmsById.set(String(film.id), {
        id: String(film.id),
        title: String(film.title),
        year: film.year ?? null,
      });
    }
  }

  /** @type {FestivalClaimAdminRow[]} */
  const adminRows = claimRows.map((row) => ({
    ...row,
    film: filmsById.get(String(row.film_id)) ?? null,
  }));

  return {
    rows: adminRows,
    summary: summarizeFestivalClaimsAdmin(adminRows),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function loadFestivalRecognitionsAdminData(supabase) {
  const { data: rows, error } = await supabase
    .from("film_festival_recognitions")
    .select(
      `${FILM_FESTIVAL_RECOGNITION_FIELDS}, canonical_festival_id, confidence_status, award_result`
    )
    .order("festival_year", { ascending: false, nullsFirst: false })
    .order("festival_name", { ascending: true })
    .order("recognition_type", { ascending: true });

  if (error) {
    throw error;
  }

  const recognitionRows = rows ?? [];
  const filmIds = [...new Set(recognitionRows.map((row) => String(row.film_id)))];

  /** @type {Map<string, FestivalRecognitionFilmRef>} */
  const filmsById = new Map();

  if (filmIds.length > 0) {
    const { data: films, error: filmsError } = await supabase
      .from("films")
      .select("id, title, year")
      .in("id", filmIds);

    if (filmsError) {
      throw filmsError;
    }

    for (const film of films ?? []) {
      filmsById.set(String(film.id), {
        id: String(film.id),
        title: String(film.title),
        year: film.year ?? null,
      });
    }
  }

  /** @type {Array<Record<string, unknown>>} */
  const adminRows = recognitionRows.map((row) => ({
    ...row,
    film: filmsById.get(String(row.film_id)) ?? null,
  }));

  return {
    rows: adminRows,
    summary: summarizeFestivalRecognitionsAdmin(adminRows),
  };
}

/**
 * @param {Array<Record<string, unknown>>} rows
 */
export function summarizeFestivalRecognitionsAdmin(rows) {
  /** @type {Map<string, number>} */
  const festivalCounts = new Map();
  /** @type {Map<string, number>} */
  const importSourceCounts = new Map();
  /** @type {Map<string, number>} */
  const recognitionTypeCounts = new Map();
  /** @type {Set<string>} */
  const filmIds = new Set();

  for (const row of rows) {
    filmIds.add(String(row.film_id));
    festivalCounts.set(
      String(row.festival_name),
      (festivalCounts.get(String(row.festival_name)) ?? 0) + 1
    );
    importSourceCounts.set(
      String(row.import_source ?? "unknown"),
      (importSourceCounts.get(String(row.import_source ?? "unknown")) ?? 0) + 1
    );
    recognitionTypeCounts.set(
      String(row.recognition_type),
      (recognitionTypeCounts.get(String(row.recognition_type)) ?? 0) + 1
    );
  }

  const toSortedEntries = (map) =>
    [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    totalRows: rows.length,
    uniqueFilms: filmIds.size,
    byFestival: toSortedEntries(festivalCounts),
    byImportSource: toSortedEntries(importSourceCounts),
    byRecognitionType: toSortedEntries(recognitionTypeCounts),
  };
}

export const CONFIRMED_ANNECY_PRESENCE_STATUSES = [
  "confirmed",
  "confirmed_presence",
  "enriched",
];

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function loadConfirmedAnnecyPresenceAdminData(supabase) {
  const { data: rows, error } = await supabase
    .from("film_festival_claims")
    .select(FILM_FESTIVAL_CLAIM_FIELDS)
    .eq("canonical_festival_id", "annecy")
    .in("claim_status", CONFIRMED_ANNECY_PRESENCE_STATUSES)
    .order("festival_year", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const claimRows = rows ?? [];
  const filmIds = [...new Set(claimRows.map((row) => String(row.film_id)))];

  /** @type {Map<string, FestivalRecognitionFilmRef>} */
  const filmsById = new Map();

  if (filmIds.length > 0) {
    const { data: films, error: filmsError } = await supabase
      .from("films")
      .select("id, title, year")
      .in("id", filmIds);

    if (filmsError) {
      throw filmsError;
    }

    for (const film of films ?? []) {
      filmsById.set(String(film.id), {
        id: String(film.id),
        title: String(film.title),
        year: film.year ?? null,
      });
    }
  }

  /** @type {FestivalClaimAdminRow[]} */
  const adminRows = claimRows.map((row) => ({
    ...row,
    film: filmsById.get(String(row.film_id)) ?? null,
  }));

  return {
    rows: adminRows,
    summary: summarizeFestivalClaimsAdmin(adminRows),
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function loadFestivalAdminData(supabase) {
  const [allClaims, annecyClaims, confirmedAnnecyPresence, recognitions] =
    await Promise.all([
      loadFestivalClaimsAdminData(supabase, null),
      loadFestivalClaimsAdminData(supabase, "annecy"),
      loadConfirmedAnnecyPresenceAdminData(supabase),
      loadConfirmedAnnecyRecognitionsAdminData(supabase),
    ]);

  return { allClaims, annecyClaims, confirmedAnnecyPresence, recognitions };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @deprecated Use loadFestivalAdminData
 */
export async function loadAnnecyFestivalAdminData(supabase) {
  const data = await loadFestivalAdminData(supabase);
  return {
    claims: data.annecyClaims,
    recognitions: data.recognitions,
    confirmedAnnecyPresence: data.confirmedAnnecyPresence,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function loadConfirmedAnnecyRecognitionsAdminData(supabase) {
  const { data: rows, error } = await supabase
    .from("film_festival_recognitions")
    .select(
      `${FILM_FESTIVAL_RECOGNITION_FIELDS}, canonical_festival_id, confidence_status, award_result`
    )
    .eq("canonical_festival_id", "annecy")
    .eq("confidence_status", "confirmed_official")
    .order("festival_year", { ascending: false, nullsFirst: false })
    .order("recognition_type", { ascending: true });

  if (error) {
    throw error;
  }

  const recognitionRows = rows ?? [];
  const filmIds = [...new Set(recognitionRows.map((row) => String(row.film_id)))];

  /** @type {Map<string, FestivalRecognitionFilmRef>} */
  const filmsById = new Map();

  if (filmIds.length > 0) {
    const { data: films, error: filmsError } = await supabase
      .from("films")
      .select("id, title, year")
      .in("id", filmIds);

    if (filmsError) {
      throw filmsError;
    }

    for (const film of films ?? []) {
      filmsById.set(String(film.id), {
        id: String(film.id),
        title: String(film.title),
        year: film.year ?? null,
      });
    }
  }

  const adminRows = recognitionRows.map((row) => ({
    ...row,
    film: filmsById.get(String(row.film_id)) ?? null,
  }));

  return {
    rows: adminRows,
    summary: summarizeFestivalRecognitionsAdmin(adminRows),
  };
}
