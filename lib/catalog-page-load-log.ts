export type CatalogPageLoadStageMs = {
  authMs: number;
  filmsMs: number;
  awardIdsMs: number;
  festivalBadgesMs: number;
  ratingsMs: number | null;
  scoresMs: number | null;
  normalizeSortMs: number;
  totalMs: number;
};

export type CatalogPageLoadLog = CatalogPageLoadStageMs & {
  viewer: "guest" | "authenticated";
  filmsCount: number;
  likedHighRatedCount: number;
  scoresRowCount: number | null;
  rankingMode: string;
  scoresFallbackCause: string | null;
};

export function createCatalogPageLoadTimer() {
  const startedAt = Date.now();

  return {
    startedAt,
    elapsedMs() {
      return Date.now() - startedAt;
    },
    log(details: Omit<CatalogPageLoadLog, "totalMs"> & { totalMs?: number }) {
      if (process.env.NODE_ENV !== "development") {
        return;
      }

      console.info("[catalog] load", {
        ...details,
        totalMs: details.totalMs ?? Date.now() - startedAt,
      });
    },
  };
}

/** Accepts thenables (e.g. Supabase builders) as well as Promises. */
export async function timeAsyncStage<T>(
  run: () => T | PromiseLike<T>
): Promise<{ value: Awaited<T>; ms: number }> {
  const startedAt = Date.now();
  const value = await run();
  return { value, ms: Date.now() - startedAt };
}

export function timeSyncStage<T>(run: () => T): { value: T; ms: number } {
  const startedAt = Date.now();
  const value = run();
  return { value, ms: Date.now() - startedAt };
}
