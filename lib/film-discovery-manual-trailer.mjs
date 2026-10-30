/**
 * Admin override: set / clear a discovery candidate trailer by hand.
 * Writes only film_discovery_candidates trailer_* + media_status — never public.films.
 */

import { resolveMediaStatus } from "./film-discovery-media.mjs";
import {
  buildManualTrailerWritePayload,
} from "./trailer-fill-policy.mjs";
import { parseYoutubeVideoId } from "./youtube-trailer-availability.mjs";
import { buildYoutubeWatchUrl } from "./youtube-trailer-search.mjs";

export const MANUAL_TRAILER_SOURCE_LABEL = "Manual";

/**
 * @param {{ poster_url?: string | null }} candidate
 * @param {unknown} trailerUrlInput — YouTube URL / video id, or empty to clear
 * @returns {{
 *   trailer_url: string | null,
 *   trailer_provider: string | null,
 *   trailer_video_id: string | null,
 *   trailer_source: string | null,
 *   trailer_source_label: string | null,
 *   media_status: string,
 *   media_updated_at: string,
 * }}
 */
export function buildManualDiscoveryTrailerPatch(candidate, trailerUrlInput) {
  const trimmed =
    typeof trailerUrlInput === "string" ? trailerUrlInput.trim() : "";
  const hasPoster = Boolean(
    typeof candidate?.poster_url === "string" && candidate.poster_url.trim()
  );
  const media_updated_at = new Date().toISOString();

  if (!trimmed) {
    return {
      trailer_url: null,
      trailer_provider: null,
      trailer_video_id: null,
      trailer_source: null,
      trailer_source_label: null,
      media_status: resolveMediaStatus({
        hasPoster,
        hasTrailer: false,
      }),
      media_updated_at,
    };
  }

  const videoId = parseYoutubeVideoId(trimmed);
  if (!videoId) {
    throw new Error(
      "Paste a YouTube watch, youtu.be, embed, shorts, or 11-character video id"
    );
  }

  const url = buildYoutubeWatchUrl(videoId);
  return {
    ...buildManualTrailerWritePayload({ url, videoId }),
    trailer_source_label: MANUAL_TRAILER_SOURCE_LABEL,
    media_status: resolveMediaStatus({
      hasPoster,
      hasTrailer: true,
    }),
    media_updated_at,
  };
}
