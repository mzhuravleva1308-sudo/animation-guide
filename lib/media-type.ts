import {
  MEDIA_TYPE as MEDIA_TYPE_RAW,
  MEDIA_TYPES as MEDIA_TYPES_RAW,
  SCORE_MODE as SCORE_MODE_RAW,
  SCORE_MODES as SCORE_MODES_RAW,
  normalizeMediaType as normalizeMediaTypeRaw,
  normalizeScoreMode as normalizeScoreModeRaw,
  oppositeMediaType as oppositeMediaTypeRaw,
  parseCatalogRankingParams as parseCatalogRankingParamsRaw,
  crossMediaSortLabel as crossMediaSortLabelRaw,
} from "./media-type.mjs";

export type MediaType = "animation" | "live_action";
export type ScoreMode = "native" | "cross_media";

export type CatalogRankingParams = {
  mediaType: MediaType;
  scoreMode: ScoreMode;
  sourceMedia: MediaType;
  sortParam: "native" | "cross_from_animation" | "cross_from_live_action";
};

export const MEDIA_TYPE = MEDIA_TYPE_RAW as {
  readonly animation: "animation";
  readonly liveAction: "live_action";
};

export const MEDIA_TYPES = MEDIA_TYPES_RAW as readonly MediaType[];

export const SCORE_MODE = SCORE_MODE_RAW as {
  readonly native: "native";
  readonly crossMedia: "cross_media";
};

export const SCORE_MODES = SCORE_MODES_RAW as readonly ScoreMode[];

export function normalizeMediaType(
  value: unknown,
  fallback: MediaType = MEDIA_TYPE.animation
): MediaType {
  return normalizeMediaTypeRaw(value, fallback) as MediaType;
}

export function normalizeScoreMode(
  value: unknown,
  fallback: ScoreMode = SCORE_MODE.native
): ScoreMode {
  return normalizeScoreModeRaw(value, fallback) as ScoreMode;
}

export function oppositeMediaType(mediaType: MediaType): MediaType {
  return oppositeMediaTypeRaw(mediaType) as MediaType;
}

export function parseCatalogRankingParams(
  params:
    | { media?: string | null; sort?: string | null }
    | URLSearchParams
    | null
    | undefined
): CatalogRankingParams {
  return parseCatalogRankingParamsRaw(params) as CatalogRankingParams;
}

export function crossMediaSortLabel(sourceMedia: MediaType): string {
  return crossMediaSortLabelRaw(sourceMedia);
}
