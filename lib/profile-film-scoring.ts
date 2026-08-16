export type RawFilmScore = {
  emotional: number;
  material: number;
  visual_world?: number;
  storytelling?: number;
};

export type FilmScore = RawFilmScore & {
  balanced: number;
  mood_score?: number;
  visual_world_score?: number;
  storytelling_score?: number;
  matchedSignalCount?: number;
};

export {
  normalizeMatchScore,
  getScoreRange,
  RANKING_AXES,
  resolveRankingAxes,
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
  countLikedHighRatingsForRanking,
  buildRawFilmScoresById,
  sortFilmsForDualModeCatalog,
  logColdStartDiagnostics,
} from "./profile-film-scoring.mjs";

export type CatalogSortMode = "cold-start" | "smart" | "smart-cross";

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
