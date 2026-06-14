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
} from "./profile-film-scoring.mjs";
