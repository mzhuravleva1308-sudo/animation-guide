/**
 * Admin override: set / clear a discovery candidate trailer by hand.
 * Writes only film_discovery_candidates trailer_* + media_status — never public.films.
 */

import { resolveMediaStatus } from "./film-discovery-media.mjs";
import {
  buildManualTrailerWritePayload,
} from "./trailer-fill-policy.mjs";
import {
  parseVimeoVideoId,
  parseYoutubeVideoId,
} from "./youtube-trailer-availability.mjs";
import { buildYoutubeWatchUrl } from "./youtube-trailer-search.mjs";

export const MANUAL_TRAILER_SOURCE_LABEL = "Manual";

/**
 * Normalize a pasted trailer link into provider + url + optional video id.
 * YouTube (preferred) is normalized to watch?v=…; other https hosts (Mubi, …) kept as-is.
 *
 * @param {unknown} trailerUrlInput
 * @returns {{ url: string, provider: string, videoId: string | null }}
 */
export function parseManualTrailerInput(trailerUrlInput) {
  const trimmed =
    typeof trailerUrlInput === "string" ? trailerUrlInput.trim() : "";
  if (!trimmed) {
    throw new Error("Trailer URL is empty");
  }

  const youtubeId = parseYoutubeVideoId(trimmed);
  if (youtubeId) {
    return {
      url: buildYoutubeWatchUrl(youtubeId),
      provider: "youtube",
      videoId: youtubeId,
    };
  }

  const vimeoId = parseVimeoVideoId(trimmed);
  if (vimeoId) {
    return {
      url: trimmed,
      provider: "vimeo",
      videoId: vimeoId,
    };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      "Paste a YouTube / Vimeo / Mubi (or other https) trailer URL, or a YouTube video id"
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Trailer URL must be http(s)");
  }

  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  let provider = "external";
  if (host === "mubi.com" || host.endsWith(".mubi.com")) {
    provider = "mubi";
  } else if (host.includes("youtube") || host === "youtu.be") {
    throw new Error(
      "Paste a YouTube watch, youtu.be, embed, shorts, or 11-character video id"
    );
  }

  return {
    url: trimmed,
    provider,
    videoId: null,
  };
}

/**
 * Same shape as discovery candidate trailer fields — also usable for films updates.
 *
 * @param {unknown} trailerUrlInput
 */
export function buildManualTrailerFields(trailerUrlInput) {
  const trimmed =
    typeof trailerUrlInput === "string" ? trailerUrlInput.trim() : "";
  if (!trimmed) {
    return {
      trailer_url: null,
      trailer_provider: null,
      trailer_video_id: null,
      trailer_source: null,
      trailer_source_label: null,
    };
  }

  const { url, provider, videoId } = parseManualTrailerInput(trimmed);
  return {
    ...buildManualTrailerWritePayload({ url, provider, videoId }),
    trailer_source_label: MANUAL_TRAILER_SOURCE_LABEL,
  };
}

/**
 * @param {{ poster_url?: string | null }} candidate
 * @param {unknown} trailerUrlInput — YouTube / Vimeo / Mubi / https URL, or empty to clear
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
  const fields = buildManualTrailerFields(trimmed);

  return {
    ...fields,
    media_status: resolveMediaStatus({
      hasPoster,
      hasTrailer: Boolean(fields.trailer_url),
    }),
    media_updated_at,
  };
}
