export {
  MEDIA_TYPE,
  MEDIA_TYPES,
  SCORE_MODE,
  SCORE_MODES,
  normalizeMediaType,
  normalizeScoreMode,
  oppositeMediaType,
  parseCatalogRankingParams,
  crossMediaSortLabel,
} from "./media-type.mjs";

export type MediaType = "animation" | "live_action";
export type ScoreMode = "native" | "cross_media";

export type CatalogRankingParams = {
  mediaType: MediaType;
  scoreMode: ScoreMode;
  sourceMedia: MediaType;
  sortParam: "native" | "cross_from_animation" | "cross_from_live_action";
};
