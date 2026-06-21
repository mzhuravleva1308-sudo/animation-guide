import { createClient } from "@supabase/supabase-js";
import { loadAppEnv } from "./load-app-env.mjs";

const BATCH_SIZE = 100;

const LOCAL_SYNC_FILM_COLUMNS = [
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
  "watch_url",
  "image_url",
  "poster_url",
  "external_image_url",
  "trailer_url",
  "availability",
  "synopsis",
  "technique",
  "moods",
  "aesthetic_tags",
  "narrative_tags",
  "themes",
  "dialogue",
  "emotional_intensity",
  "weirdness",
  "kid_safety",
  "why_i_might_like_it",
  "personal_note",
  "status",
  "cold_start_score",
  "cold_start_note",
  "normalized_title",
  "normalized_original_title",
  "tmdb_id",
  "imdb_id",
  "created_at",
];

const LOCAL_SYNC_PROFILE_COLUMNS = [
  "id",
  "name",
  "slug",
  "share_token",
  "user_id",
  "taste_profile",
  "taste_profile_updated_at",
  "created_at",
];

const LOCAL_SYNC_FESTIVAL_CLAIM_COLUMNS = [
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
];

async function fetchAllRows(client, table, options = {}) {
  const pageSize = options.pageSize ?? 1000;
  const select = options.select ?? "*";
  /** @type {Record<string, unknown>[]} */
  const rows = [];
  let from = 0;

  while (true) {
    let query = client.from(table).select(select).range(from, from + pageSize - 1);
    if (options.filters) {
      query = options.filters(query);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function getTableColumnNames(client, table, fallbackClient = null) {
  const { data, error } = await client.from(table).select("*").limit(1);
  if (error) {
    throw error;
  }

  if (data?.[0]) {
    return Object.keys(data[0]);
  }

  if (fallbackClient) {
    const { data: fallbackData, error: fallbackError } = await fallbackClient
      .from(table)
      .select("*")
      .limit(1);
    if (fallbackError) {
      throw fallbackError;
    }
    if (fallbackData?.[0]) {
      return Object.keys(fallbackData[0]);
    }
  }

  return [];
}

function pickColumns(rows, allowedColumns) {
  const allowed = new Set(allowedColumns);
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(([key]) => allowed.has(key))
    )
  );
}

function resolveSyncColumns(detectedColumns, allowlist) {
  if (detectedColumns.length > 0) {
    const allow = new Set(allowlist);
    return detectedColumns.filter((column) => allow.has(column));
  }

  return allowlist;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 */
async function upsertInBatches(client, table, rows) {
  if (rows.length === 0) {
    return 0;
  }

  let written = 0;

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { error } = await client.from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      throw error;
    }
    written += batch.length;
  }

  return written;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 * @param {string} onConflict
 */
async function upsertCompositeInBatches(client, table, rows, onConflict) {
  if (rows.length === 0) {
    return 0;
  }

  let written = 0;

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    const { error } = await client.from(table).upsert(batch, { onConflict });
    if (error) {
      throw error;
    }
    written += batch.length;
  }

  return written;
}

function parseArgs(argv) {
  const profileSlugIndex = argv.indexOf("--profile-slug");
  const profileTokenIndex = argv.indexOf("--profile-token");

  return {
    profileSlug:
      profileSlugIndex >= 0 ? argv[profileSlugIndex + 1] : "maria",
    profileToken:
      profileTokenIndex >= 0 ? argv[profileTokenIndex + 1] : null,
    skipClaims: argv.includes("--skip-claims"),
    skipEmbeddings: argv.includes("--skip-embeddings"),
    keepExistingFilms: argv.includes("--keep-existing-films"),
    claimsOnly: argv.includes("--claims-only"),
  };
}

async function syncFestivalClaims(hosted, local, localClaimColumns) {
  console.log("Fetching hosted festival claims...");
  const claims = pickColumns(
    await fetchAllRows(hosted, "film_festival_claims", {
      pageSize: 1000,
    }),
    localClaimColumns
  );
  console.log(`Fetched ${claims.length} festival claims`);

  await local
    .from("film_festival_claims")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  console.log("Upserting festival claims into local...");
  const claimCount = await upsertInBatches(local, "film_festival_claims", claims);
  console.log(`Upserted ${claimCount} festival claims`);
  return claimCount;
}

async function clearLocalCatalog(local) {
  const deleteAll = async (table, column = "id") => {
    const { error } = await local
      .from(table)
      .delete()
      .neq(column, "00000000-0000-0000-0000-000000000000");

    if (error && error.code !== "PGRST205" && error.code !== "42P01") {
      throw error;
    }
  };

  await deleteAll("film_festival_claims");
  await deleteAll("film_festival_recognitions");
  await deleteAll("film_ratings");
  await deleteAll("profile_film_lists");
  await deleteAll("profile_film_scores");
  await deleteAll("profile_taste_cores");
  await deleteAll("film_mood_embeddings", "film_id");
  await deleteAll("film_aesthetic_embeddings", "film_id");
  await deleteAll("films");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const hostedEnv = loadAppEnv({ mode: "hosted" });
  const localEnv = loadAppEnv({ mode: "development" });

  for (const [label, env] of [
    ["hosted", hostedEnv],
    ["local", localEnv],
  ]) {
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(`Missing Supabase credentials for ${label} environment.`);
    }
  }

  const hosted = createClient(
    hostedEnv.NEXT_PUBLIC_SUPABASE_URL,
    hostedEnv.SUPABASE_SERVICE_ROLE_KEY
  );
  const local = createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.SUPABASE_SERVICE_ROLE_KEY
  );

  let localClaimColumns = LOCAL_SYNC_FESTIVAL_CLAIM_COLUMNS;
  if (!args.skipClaims) {
    try {
      localClaimColumns = resolveSyncColumns(
        await getTableColumnNames(local, "film_festival_claims"),
        LOCAL_SYNC_FESTIVAL_CLAIM_COLUMNS
      );
    } catch {
      localClaimColumns = LOCAL_SYNC_FESTIVAL_CLAIM_COLUMNS;
    }
  }

  if (args.claimsOnly) {
    if (args.skipClaims) {
      throw new Error("--claims-only cannot be combined with --skip-claims");
    }

    const claimCount = await syncFestivalClaims(
      hosted,
      local,
      localClaimColumns
    );
    console.log("");
    console.log("=== Claims sync complete ===");
    console.log(`Festival claims: ${claimCount}`);
    return;
  }

  const localFilmColumns = resolveSyncColumns(
    await getTableColumnNames(local, "films"),
    LOCAL_SYNC_FILM_COLUMNS
  );

  if (!args.keepExistingFilms) {
    console.log("Clearing local catalog tables...");
    await clearLocalCatalog(local);
  }

  console.log("Fetching hosted catalog...");
  const films = pickColumns(
    await fetchAllRows(hosted, "films", {
      pageSize: 500,
    }),
    localFilmColumns
  );
  console.log(`Fetched ${films.length} films`);

  console.log("Upserting films into local...");
  const filmCount = await upsertInBatches(local, "films", films);
  console.log(`Upserted ${filmCount} films`);

  if (!args.skipClaims) {
    try {
      await syncFestivalClaims(hosted, local, localClaimColumns);
    } catch (error) {
      console.warn(
        "Skipped festival claims:",
        error instanceof Error ? error.message : error
      );
    }
  }

  if (!args.skipEmbeddings) {
    try {
      const filmIds = films.map((film) => String(film.id));
      console.log("Fetching hosted film embeddings...");

      const moodColumns = resolveSyncColumns(
        await getTableColumnNames(local, "film_mood_embeddings"),
        ["film_id", "mood_text", "embedding", "updated_at"]
      );
      const aestheticColumns = resolveSyncColumns(
        await getTableColumnNames(local, "film_aesthetic_embeddings"),
        ["film_id", "aesthetic_text", "embedding", "updated_at"]
      );

      const [moodEmbeddings, aestheticEmbeddings] = await Promise.all([
        fetchAllRows(hosted, "film_mood_embeddings", {
          pageSize: 500,
          filters: (query) => query.in("film_id", filmIds),
        }),
        fetchAllRows(hosted, "film_aesthetic_embeddings", {
          pageSize: 500,
          filters: (query) => query.in("film_id", filmIds),
        }),
      ]);

      console.log(
        `Fetched ${moodEmbeddings.length} mood embeddings, ${aestheticEmbeddings.length} aesthetic embeddings`
      );

      const moodCount = await upsertCompositeInBatches(
        local,
        "film_mood_embeddings",
        pickColumns(moodEmbeddings, moodColumns),
        "film_id"
      );
      const aestheticCount = await upsertCompositeInBatches(
        local,
        "film_aesthetic_embeddings",
        pickColumns(aestheticEmbeddings, aestheticColumns),
        "film_id"
      );
      console.log(
        `Upserted ${moodCount} mood embeddings and ${aestheticCount} aesthetic embeddings`
      );
    } catch (error) {
      console.warn(
        "Skipped film embeddings:",
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log(`Fetching hosted profile ${args.profileSlug}...`);
  let profileQuery = hosted.from("profiles").select("*").eq("slug", args.profileSlug);
  if (args.profileToken) {
    profileQuery = profileQuery.eq("share_token", args.profileToken);
  }

  const { data: profile, error: profileError } = await profileQuery.maybeSingle();
  if (profileError) {
    throw profileError;
  }
  if (!profile) {
    throw new Error(
      `Profile not found on hosted for slug=${args.profileSlug}${
        args.profileToken ? ` token=${args.profileToken}` : ""
      }`
    );
  }

  const localProfile = pickColumns(
    [
      {
        ...profile,
        user_id: null,
      },
    ],
    resolveSyncColumns(
      await getTableColumnNames(local, "profiles"),
      LOCAL_SYNC_PROFILE_COLUMNS
    )
  )[0];

  console.log("Upserting profile into local...");
  const { error: profileUpsertError } = await local
    .from("profiles")
    .upsert(localProfile, { onConflict: "id" });
  if (profileUpsertError) {
    throw profileUpsertError;
  }

  const profileId = String(profile.id);
  console.log(`Syncing profile data for ${profile.slug} (${profileId})...`);

  const [ratings, lists, scores, cores] = await Promise.all([
    fetchAllRows(hosted, "film_ratings", {
      filters: (query) => query.eq("profile_id", profileId),
    }),
    fetchAllRows(hosted, "profile_film_lists", {
      filters: (query) => query.eq("profile_id", profileId),
    }),
    fetchAllRows(hosted, "profile_film_scores", {
      filters: (query) => query.eq("profile_id", profileId),
    }),
    fetchAllRows(hosted, "profile_taste_cores", {
      filters: (query) => query.eq("profile_id", profileId),
    }),
  ]);

  const ratingColumns = resolveSyncColumns(
    await getTableColumnNames(local, "film_ratings"),
    ["id", "profile_id", "film_id", "rating", "updated_at"]
  );
  const listColumns = resolveSyncColumns(
    await getTableColumnNames(local, "profile_film_lists"),
    ["id", "profile_id", "film_id", "list_type", "created_at"]
  );
  const scoreColumns = resolveSyncColumns(
    await getTableColumnNames(local, "profile_film_scores"),
    [
      "id",
      "profile_id",
      "film_id",
      "emotional_score",
      "material_score",
      "computed_at",
    ]
  );
  const coreColumns = resolveSyncColumns(
    await getTableColumnNames(local, "profile_taste_cores"),
    [
      "id",
      "profile_id",
      "core_type",
      "core_index",
      "name",
      "description",
      "strength",
      "coverage",
      "maturity",
      "average_rating",
      "film_ids",
      "film_titles",
      "nearest_moods",
      "center_embedding",
      "emotional_profile_tags",
      "aesthetic_profile_tags",
      "name_generated_at",
      "updated_at",
    ]
  );

  await Promise.all([
    local.from("film_ratings").delete().eq("profile_id", profileId),
    local.from("profile_film_lists").delete().eq("profile_id", profileId),
    local.from("profile_film_scores").delete().eq("profile_id", profileId),
    local.from("profile_taste_cores").delete().eq("profile_id", profileId),
  ]);

  const syncedFilmIds = new Set(films.map((film) => String(film.id)));

  const filterBySyncedFilms = (rows) =>
    rows.filter((row) => syncedFilmIds.has(String(row.film_id)));

  const [ratingCount, listCount, scoreCount, coreCount] = await Promise.all([
    upsertCompositeInBatches(
      local,
      "film_ratings",
      pickColumns(filterBySyncedFilms(ratings), ratingColumns),
      "film_id,profile_id"
    ),
    upsertInBatches(
      local,
      "profile_film_lists",
      pickColumns(filterBySyncedFilms(lists), listColumns)
    ),
    upsertCompositeInBatches(
      local,
      "profile_film_scores",
      pickColumns(filterBySyncedFilms(scores), scoreColumns),
      "profile_id,film_id"
    ),
    upsertCompositeInBatches(
      local,
      "profile_taste_cores",
      pickColumns(cores, coreColumns).map((core) => ({
        ...core,
        film_ids: Array.isArray(core.film_ids)
          ? core.film_ids.filter((filmId) => syncedFilmIds.has(String(filmId)))
          : core.film_ids,
      })),
      "profile_id,core_type,core_index"
    ),
  ]);

  console.log("");
  console.log("=== Sync complete ===");
  console.log(`Films: ${filmCount}`);
  console.log(
    `Profile: /p/${profile.slug}?token=${profile.share_token}`
  );
  console.log(
    `Profile data: ${ratingCount} ratings, ${listCount} watchlist rows, ${scoreCount} scores, ${coreCount} taste cores`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
