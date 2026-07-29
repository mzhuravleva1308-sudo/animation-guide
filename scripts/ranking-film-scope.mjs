import { resolveScopedFilmIds } from "./film-scope.mjs";

export const RANKING_FILM_IDS = [
  "78a124c0-3523-49e5-8c6f-6b37feacc307",
  "8740e91d-b6e7-4149-8c9b-de6ecd178081",
  "7a96add5-2452-4eca-b281-e5d57eea0642",
  "4eb01d38-9563-4758-ae71-bc2482d76b43",
  "88bad3eb-7f9b-4b40-a77e-e221c17ba338",
];

export function assertExactRankingFilmIds(ids) {
  const actual = [...ids];
  const expected = [...RANKING_FILM_IDS].sort();
  const received = [...actual].sort();

  if (
    actual.length !== RANKING_FILM_IDS.length ||
    new Set(actual).size !== actual.length ||
    received.some((id, index) => id !== expected[index])
  ) {
    throw new Error(
      `Ranking film scope mismatch. Expected exactly: ${expected.join(
        ", "
      )}; received: ${received.join(", ")}`
    );
  }

  return [...RANKING_FILM_IDS];
}

export async function resolveAndAssertRankingFilmScope(supabase, scope) {
  const ids = await resolveScopedFilmIds(supabase, scope);

  if (!ids) {
    throw new Error(
      "Ranking pipeline requires an explicit --film-ids scope; full catalog is forbidden."
    );
  }

  return assertExactRankingFilmIds(ids);
}
