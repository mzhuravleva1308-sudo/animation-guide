import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";

async function columnExists(client, columnName) {
  const { error } = await client.from("films").select(columnName).limit(1);
  return !error;
}

async function main() {
  applyAppEnv({ mode: "hosted" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const checks = {
    what_it_is: await columnExists(supabase, "what_it_is"),
    the_mood: await columnExists(supabase, "the_mood"),
  };

  const { count: total } = await supabase
    .from("films")
    .select("*", { count: "exact", head: true });

  let withCopy = null;
  if (checks.what_it_is && checks.the_mood) {
    const { count } = await supabase
      .from("films")
      .select("*", { count: "exact", head: true })
      .not("what_it_is", "is", null)
      .not("the_mood", "is", null);
    withCopy = count;
  }

  const { data: sample, error: sampleError } = await supabase
    .from("films")
    .select(
      checks.what_it_is
        ? "id, title, technique, what_it_is, the_mood"
        : "id, title, technique"
    )
    .order("title")
    .limit(3);

  if (sampleError) {
    throw sampleError;
  }

  console.log(
    JSON.stringify(
      {
        columns: checks,
        filmsTotal: total,
        filmsWithEditorialCopy: withCopy,
        sample,
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
