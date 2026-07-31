export type RawFilmScore = {
  emotional: number;
  material: number;
};

export type FilmScore = RawFilmScore & {
  balanced: number;
  matchedSignalCount?: number;
};

export {
  normalizeMatchScore,
  getScoreRange,
  buildBalancedScores,
  compareFilmsByScore,
  sortFilmsByScore,
  COLD_START_LOOK_AHEAD,
  compareFilmsByTitleAndId,
  compareColdStartScoredFilms,
  diversityRerankColdStartFilms,
  sortFilmsByColdStart,
  LIKED_HIGH_RATING_THRESHOLD,
  countLikedHighRatings,
  buildRawFilmScoresById,
  sortFilmsForDualModeCatalog,
  logColdStartDiagnostics,
} from "./profile-film-scoring.mjs";

export type CatalogSortMode = "cold-start" | "smart";

export type SmartScoresFallbackCause = "empty-scores" | "query-error";

export type DualModeCatalogSortResult = {
  films: import("@/types/film").Film[];
  mode: CatalogSortMode;
  reason:
    | "guest"
    | "no-high-ratings"
    | "smart-scores-unavailable"
    | "profile-scores";
  scoresFallbackCause: SmartScoresFallbackCause | null;
};
