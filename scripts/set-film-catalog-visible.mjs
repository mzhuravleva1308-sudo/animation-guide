/**
 * Soft-hide / restore films in the public catalog via films.catalog_visible.
 *
 * Usage:
 *   APP_ENV=hosted node scripts/set-film-catalog-visible.mjs --visible=false --film-id <uuid> [--film-id <uuid>]
 *   APP_ENV=hosted node scripts/set-film-catalog-visible.mjs --visible=true --title "Tana"
 *
 * Only updates catalog_visible. Does not touch media, metadata, tags, embeddings, or scores.
 */
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";

applyAppEnv();

function parseArgs(argv) {
  /** @type {string[]} */
  const filmIds = [];
  /** @type {string[]} */
  const titles = [];
  /** @type {boolean | null} */
  let visible = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--visible" || arg.startsWith("--visible=")) {
      const value =
        arg === "--visible" ? argv[++index] : arg.slice("--visible=".length);
      if (value !== "true" && value !== "false") {
        throw new Error("--visible must be true or false");
      }
      visible = value === "true";
      continue;
    }

    if (arg === "--film-id" || arg.startsWith("--film-id=")) {
      const value =
        arg === "--film-id" ? argv[++index] : arg.slice("--film-id=".length);
      if (!value?.trim()) throw new Error("Missing --film-id value");
      filmIds.push(value.trim());
      continue;
    }

    if (arg === "--title" || arg.startsWith("--title=")) {
      const value =
        arg === "--title" ? argv[++index] : arg.slice("--title=".length);
      if (!value?.trim()) throw new Error("Missing --title value");
      titles.push(value.trim());
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (visible == null) {
    throw new Error("Required: --visible=true|false");
  }
  if (filmIds.length === 0 && titles.length === 0) {
    throw new Error("Required: --film-id and/or --title");
  }

  return { visible, filmIds, titles };
}

async function main() {
  const { visible, filmIds, titles } = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key);
  /** @type {string[]} */
  const ids = [...filmIds];

  for (const title of titles) {
    const { data, error } = await supabase
      .from("films")
      .select("id, title")
      .ilike("title", title);
    if (error) throw error;
    if (!data?.length) {
      throw new Error(`No film found for title "${title}"`);
    }
    if (data.length > 1) {
      throw new Error(
        `Ambiguous title "${title}": ${data.map((row) => row.id).join(", ")}`
      );
    }
    ids.push(data[0].id);
  }

  const uniqueIds = [...new Set(ids)];
  const { data: before, error: beforeError } = await supabase
    .from("films")
    .select("id, title, catalog_visible")
    .in("id", uniqueIds);
  if (beforeError) throw beforeError;

  const { error: updateError } = await supabase
    .from("films")
    .update({ catalog_visible: visible })
    .in("id", uniqueIds);
  if (updateError) throw updateError;

  const { data: after, error: afterError } = await supabase
    .from("films")
    .select("id, title, catalog_visible")
    .in("id", uniqueIds)
    .order("title");
  if (afterError) throw afterError;

  console.log(
    JSON.stringify(
      {
        catalog_visible: visible,
        before,
        after,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
