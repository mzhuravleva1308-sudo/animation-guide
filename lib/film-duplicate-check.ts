export type {
  DuplicateMatch,
  FilmIdentity,
  InsertBlockReason,
} from "./film-duplicate-check.types";

export {
  applyNormalizedFields,
  compareYears,
  evaluateDuplicate,
  findFilmDuplicates,
  getDirectorSimilarity,
  getMatchingExternalIdField,
  getTitleSimilarity,
  getWordOverlapRatio,
  normalizeDirector,
  normalizeFilmString,
  parseInsertFilmFlags,
  shouldBlockInsert,
} from "./film-duplicate-check.mjs";
