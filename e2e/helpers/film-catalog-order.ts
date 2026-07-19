import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} for E2E film catalog checks.`);
  }

  return value;
}

export type CatalogFilmRef = {
  id: string;
  title: string;
};

const SMOKE_RATING_FILM_OFFSET_BY_PROJECT: Record<string, number> = {
  chromium: 0,
  firefox: 1,
  webkit: 2,
  "mobile-chrome": 3,
  "mobile-safari": 4,
};

export async function getSmokeRatingFilmForProject(
  projectName: string
): Promise<CatalogFilmRef> {
  const offset = SMOKE_RATING_FILM_OFFSET_BY_PROJECT[projectName] ?? 0;
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  const { data, error } = await supabase
    .from("films")
    .select("id, title")
    .eq("catalog_visible", true)
    .order("id")
    .range(offset, offset)
    .single();

  if (error || !data?.id || !data.title) {
    throw new Error(
      `Failed to load smoke rating film for ${projectName}: ${error?.message ?? "missing film"}`
    );
  }

  return { id: data.id, title: data.title };
}

export async function getFirstFilmTitleByIdOrder(): Promise<string> {
  const film = await getSmokeRatingFilmForProject("chromium");
  return film.title;
}
