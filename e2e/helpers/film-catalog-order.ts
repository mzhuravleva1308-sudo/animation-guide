import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} for E2E film catalog checks.`);
  }

  return value;
}

export async function getFirstFilmTitleByIdOrder(): Promise<string> {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase
    .from("films")
    .select("title")
    .order("id")
    .limit(1)
    .single();

  if (error || !data?.title) {
    throw new Error(
      `Failed to load lowest-id film: ${error?.message ?? "no title"}`
    );
  }

  return data.title;
}
