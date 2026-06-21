import { createClient } from "@supabase/supabase-js";
import { applyAppEnv, loadAppEnv } from "./load-app-env.mjs";

function createHostedClient() {
  const env = loadAppEnv({ mode: "hosted" });
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing hosted Supabase credentials");
  }

  return createClient(url, key);
}

function createLocalClient() {
  const env = loadAppEnv({ mode: "development" });
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing local Supabase credentials");
  }

  return createClient(url, key);
}

async function columnExists(client, columnName) {
  const { error } = await client.from("films").select(columnName).limit(1);
  return !error;
}

async function getFilmsWithEditorialCopy(client) {
  const pageSize = 100;
  const films = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from("films")
      .select("id, title, what_it_is, the_mood")
      .not("what_it_is", "is", null)
      .not("the_mood", "is", null)
      .order("title")
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    if (!data?.length) {
      break;
    }

    films.push(...data);
    from += pageSize;

    if (data.length < pageSize) {
      break;
    }
  }

  return films;
}

async function main() {
  applyAppEnv({ mode: "hosted" });

  const local = createLocalClient();
  const hosted = createHostedClient();

  const hostedHasColumns =
    (await columnExists(hosted, "what_it_is")) &&
    (await columnExists(hosted, "the_mood"));

  if (!hostedHasColumns) {
    throw new Error(
      "Hosted films.what_it_is/the_mood columns are missing. Run scripts/apply-hosted-migrations.mjs first."
    );
  }

  const sourceFilms = await getFilmsWithEditorialCopy(local);
  if (!sourceFilms.length) {
    throw new Error("Local database has no editorial copy to sync.");
  }

  let updated = 0;
  let skipped = 0;

  for (const film of sourceFilms) {
    const { data: existing, error: readError } = await hosted
      .from("films")
      .select("id, what_it_is, the_mood")
      .eq("id", film.id)
      .maybeSingle();

    if (readError) {
      throw readError;
    }

    if (!existing) {
      console.warn(`Missing on hosted: ${film.title}`);
      skipped += 1;
      continue;
    }

    if (existing.what_it_is && existing.the_mood) {
      skipped += 1;
      continue;
    }

    const { error: updateError } = await hosted
      .from("films")
      .update({
        what_it_is: film.what_it_is,
        the_mood: film.the_mood,
      })
      .eq("id", film.id);

    if (updateError) {
      throw updateError;
    }

    updated += 1;
  }

  console.log(
    `Done. Synced ${updated} films from local, skipped ${skipped}, source ${sourceFilms.length}.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
