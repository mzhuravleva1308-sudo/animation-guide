/**
 * Shared CLI scope for film maintenance scripts.
 *
 * Full catalog (default):
 *   node scripts/cache-posters.mjs
 *
 * Single film:
 *   node scripts/cache-posters.mjs --film-id <uuid>
 *   node scripts/cache-posters.mjs --title "Even Mice Belong in Heaven"
 */

/**
 * @param {string[]} argv
 */
export function parseFilmScopeArgs(argv) {
  /** @type {string[]} */
  const filmIds = [];
  /** @type {string[]} */
  const titles = [];
  /** @type {string[]} */
  const passthrough = [];
  let all = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--all") {
      all = true;
      continue;
    }

    if (arg === "--film-id") {
      const next = argv[index + 1];

      if (!next) {
        throw new Error("Missing value for --film-id");
      }

      filmIds.push(next.trim());
      index += 1;
      continue;
    }

    if (arg.startsWith("--film-id=")) {
      const value = arg.slice("--film-id=".length).trim();

      if (value) {
        filmIds.push(value);
      }

      continue;
    }

    if (arg === "--film-ids") {
      const next = argv[index + 1];

      if (!next) {
        throw new Error("Missing value for --film-ids");
      }

      filmIds.push(
        ...next
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      );
      index += 1;
      continue;
    }

    if (arg.startsWith("--film-ids=")) {
      filmIds.push(
        ...arg
          .slice("--film-ids=".length)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      );
      continue;
    }

    if (arg === "--title") {
      const next = argv[index + 1];

      if (!next) {
        throw new Error("Missing value for --title");
      }

      titles.push(next.trim());
      index += 1;
      continue;
    }

    if (arg.startsWith("--title=")) {
      const value = arg.slice("--title=".length).trim();

      if (value) {
        titles.push(value);
      }

      continue;
    }

    passthrough.push(arg);
  }

  return {
    filmIds,
    titles,
    all,
    passthrough,
    scoped: !all && (filmIds.length > 0 || titles.length > 0),
  };
}

/**
 * @param {ReturnType<typeof parseFilmScopeArgs>} scope
 */
export function filmScopeArgvTokens(scope) {
  if (scope.all) {
    return ["--all"];
  }

  /** @type {string[]} */
  const tokens = [];

  for (const filmId of scope.filmIds) {
    tokens.push("--film-id", filmId);
  }

  for (const title of scope.titles) {
    tokens.push("--title", title);
  }

  return tokens;
}

/**
 * @param {ReturnType<typeof parseFilmScopeArgs>} scope
 */
export function describeFilmScope(scope) {
  if (scope.all || !scope.scoped) {
    return "full catalog";
  }

  /** @type {string[]} */
  const parts = [];

  if (scope.filmIds.length) {
    parts.push(`film id(s): ${scope.filmIds.join(", ")}`);
  }

  if (scope.titles.length) {
    parts.push(`title(s): ${scope.titles.join(", ")}`);
  }

  return parts.join("; ");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {ReturnType<typeof parseFilmScopeArgs>} scope
 */
export async function resolveScopedFilmIds(supabase, scope) {
  if (scope.all || !scope.scoped) {
    return null;
  }

  /** @type {Set<string>} */
  const ids = new Set(scope.filmIds);

  for (const title of scope.titles) {
    const { data, error } = await supabase
      .from("films")
      .select("id, title")
      .ilike("title", title)
      .limit(1);

    if (error) {
      throw error;
    }

    if (!data?.length) {
      throw new Error(`No film matched --title "${title}"`);
    }

    ids.add(data[0].id);
  }

  if (ids.size === 0) {
    throw new Error("Film scope is empty — pass --film-id or --title");
  }

  return Array.from(ids);
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {ReturnType<typeof parseFilmScopeArgs>} scope
 * @param {{
 *   select: string,
 *   applyFilters?: (query: ReturnType<import("@supabase/supabase-js").SupabaseClient["from"]>) => unknown,
 * }} options
 */
export async function loadScopedFilms(supabase, scope, options) {
  const { select, applyFilters } = options;
  const scopedIds = await resolveScopedFilmIds(supabase, scope);

  if (scopedIds) {
    const { data: scopedRows, error: scopedError } = await supabase
      .from("films")
      .select("id")
      .in("id", scopedIds);

    if (scopedError) {
      throw scopedError;
    }

    if (!scopedRows?.length) {
      throw new Error(`No films found for scope: ${describeFilmScope(scope)}`);
    }
  }

  let query = supabase.from("films").select(select);

  if (scopedIds) {
    query = query.in("id", scopedIds);
  }

  if (applyFilters) {
    query = applyFilters(query);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}
