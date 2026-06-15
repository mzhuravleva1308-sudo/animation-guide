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
  logColdStartDiagnostics,
} from "./profile-film-scoring.mjs";
