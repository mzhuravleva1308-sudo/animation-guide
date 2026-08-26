const YOUTUBE_VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
const YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed";
const VIMEO_OEMBED_ENDPOINT = "https://vimeo.com/api/oembed.json";

const YOUTUBE_ID_RE = /^[\w-]{11}$/;

/**
 * @param {unknown} input — watch URL, embed URL, or raw video id
 * @returns {string | null}
 */
export function parseYoutubeVideoId(input) {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  if (YOUTUBE_ID_RE.test(value)) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }

  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && YOUTUBE_ID_RE.test(fromQuery)) return fromQuery;

    const parts = url.pathname.split("/").filter(Boolean);
    const nested =
      parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live"
        ? parts[1]
        : null;
    if (nested && YOUTUBE_ID_RE.test(nested)) return nested;
  }

  return null;
}

/**
 * @param {unknown} input
 * @returns {string | null}
 */
export function parseVimeoVideoId(input) {
  if (typeof input !== "string") return null;
  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
    const id = url.pathname.split("/").filter(Boolean).pop() ?? "";
    return /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function youtubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Territorial allow-lists shorter than this are not catalog-safe (Netflix US, etc.). */
export const MIN_GEO_ALLOWLIST_COUNTRIES = 50;
/** Block-lists this large mean the video is effectively territorial (MUBI UK, etc.). */
export const MAX_GEO_BLOCKLIST_COUNTRIES = 40;

/**
 * YouTube `contentDetails.regionRestriction`.
 * `allowed` = playable only in those countries.
 * `blocked` = unplayable in those countries.
 *
 * @param {{ allowed?: string[], blocked?: string[] } | null | undefined} regionRestriction
 * @returns {{ ok: boolean, reason: string | null }}
 */
export function evaluateYoutubeRegionRestriction(regionRestriction) {
  if (!regionRestriction || typeof regionRestriction !== "object") {
    return { ok: true, reason: null };
  }

  const allowed = Array.isArray(regionRestriction.allowed)
    ? regionRestriction.allowed
    : [];
  const blocked = Array.isArray(regionRestriction.blocked)
    ? regionRestriction.blocked
    : [];

  if (allowed.length > 0 && allowed.length < MIN_GEO_ALLOWLIST_COUNTRIES) {
    return { ok: false, reason: "youtube_geo_allowlist" };
  }
  if (blocked.length >= MAX_GEO_BLOCKLIST_COUNTRIES) {
    return { ok: false, reason: "youtube_geo_blocklist" };
  }
  return { ok: true, reason: null };
}

function evaluateYoutubeListItem(item) {
  const privacy = item?.status?.privacyStatus;
  const upload = item?.status?.uploadStatus;
  if (privacy === "private") {
    return { available: false, reason: "youtube_private" };
  }
  if (upload && upload !== "processed" && upload !== "uploaded") {
    return { available: false, reason: `youtube_upload_${upload}` };
  }
  const geo = evaluateYoutubeRegionRestriction(
    item?.contentDetails?.regionRestriction
  );
  if (!geo.ok) {
    return { available: false, reason: geo.reason };
  }
  return { available: true, reason: "youtube_videos_list" };
}

async function checkViaYoutubeDataApi(videoId, { apiKey, fetchImpl }) {
  const params = new URLSearchParams({
    part: "status,contentDetails",
    id: videoId,
    key: apiKey,
  });
  const response = await fetchImpl(`${YOUTUBE_VIDEOS_ENDPOINT}?${params}`);
  if (response.status === 429 || response.status === 403) {
    return { ok: false, quota: true };
  }
  if (!response.ok) {
    return { ok: false, quota: false };
  }
  const data = await response.json();
  const item = (data.items ?? []).find((row) => row.id === videoId);
  if (!item) {
    return {
      ok: true,
      result: {
        available: false,
        reason: "youtube_video_not_found",
        videoId,
      },
    };
  }
  const evaluation = evaluateYoutubeListItem(item);
  return {
    ok: true,
    result: {
      ...evaluation,
      videoId,
    },
  };
}

async function checkViaYoutubeOembed(videoId, fetchImpl) {
  const response = await fetchImpl(
    `${YOUTUBE_OEMBED_ENDPOINT}?url=${encodeURIComponent(
      youtubeWatchUrl(videoId)
    )}&format=json`
  );
  if (response.ok) {
    return { available: true, reason: "youtube_oembed", videoId };
  }
  if (response.status === 404) {
    return { available: false, reason: "youtube_oembed_not_found", videoId };
  }
  // 401/403: embed disabled vs private. Watch-page links still work for
  // embed-disabled public videos, so fail open without Data API.
  if (response.status === 401 || response.status === 403) {
    return {
      available: true,
      reason: "youtube_oembed_restricted_embed",
      videoId,
    };
  }
  return {
    available: false,
    reason: `youtube_oembed_${response.status}`,
    videoId,
  };
}

/**
 * Is this YouTube video still publicly openable on the watch page?
 * Prefers Data API (empty items = deleted/private). Falls back to oEmbed.
 *
 * Transport / quota failures fail open so a YouTube outage does not wipe
 * every trailer lookup.
 *
 * @param {{
 *   videoId?: string | null,
 *   url?: string | null,
 *   apiKey?: string | null,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export async function checkYoutubeVideoAvailability(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const videoId =
    options.videoId ?? parseYoutubeVideoId(options.url ?? "") ?? null;

  if (!videoId) {
    return {
      available: false,
      reason: "missing_video_id",
      videoId: null,
    };
  }

  try {
    if (options.apiKey) {
      const api = await checkViaYoutubeDataApi(videoId, {
        apiKey: options.apiKey,
        fetchImpl,
      });
      if (api.ok) return api.result;
    }

    return await checkViaYoutubeOembed(videoId, fetchImpl);
  } catch (error) {
    return {
      available: true,
      reason: "check_failed_open",
      videoId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Batch Data API check (up to 50 ids per request). IDs missing from the
 * response are treated as deleted.
 *
 * @param {string[]} videoIds
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} options
 * @returns {Promise<Map<string, { available: boolean, reason: string, videoId: string, title?: string | null }>>}
 */
export async function checkYoutubeVideosAvailability(videoIds, options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const unique = [...new Set((videoIds ?? []).filter(Boolean))];
  /** @type {Map<string, { available: boolean, reason: string, videoId: string, title?: string | null }>} */
  const results = new Map();

  if (!options.apiKey) {
    for (const videoId of unique) {
      results.set(
        videoId,
        await checkYoutubeVideoAvailability({
          videoId,
          fetchImpl,
        })
      );
    }
    return results;
  }

  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50);
    const params = new URLSearchParams({
      part: "status,snippet,contentDetails",
      id: chunk.join(","),
      key: options.apiKey,
    });
    const response = await fetchImpl(`${YOUTUBE_VIDEOS_ENDPOINT}?${params}`);
    if (!response.ok) {
      throw new Error(`YouTube videos.list failed (${response.status})`);
    }
    const data = await response.json();
    for (const item of data.items ?? []) {
      const videoId = item.id;
      if (!videoId) continue;
      const evaluation = evaluateYoutubeListItem(item);
      results.set(videoId, {
        ...evaluation,
        videoId,
        title: item.snippet?.title ?? null,
      });
    }
    for (const videoId of chunk) {
      if (!results.has(videoId)) {
        results.set(videoId, {
          available: false,
          reason: "youtube_video_not_found",
          videoId,
        });
      }
    }
  }

  return results;
}

/**
 * @param {{ apiKey?: string | null, fetchImpl?: typeof fetch }} [options]
 * @returns {(video: { key?: string, video_id?: string, videoId?: string, url?: string, site?: string }) => Promise<boolean>}
 */
export function createYoutubeAvailabilityChecker(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = new Map();

  return async function isYoutubeTrailerAvailable(video) {
    if (video?.site && video.site !== "YouTube") {
      return false;
    }
    const videoId =
      video?.key ??
      video?.video_id ??
      video?.videoId ??
      parseYoutubeVideoId(video?.url ?? "") ??
      null;
    if (!videoId) return false;
    if (cache.has(videoId)) return cache.get(videoId);

    const result = await checkYoutubeVideoAvailability({
      videoId,
      apiKey: options.apiKey,
      fetchImpl,
    });
    cache.set(videoId, result.available);
    return result.available;
  };
}

/**
 * Non-YouTube trailer URL: Vimeo oEmbed, otherwise HTTP GET.
 *
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function checkNonYoutubeTrailerAvailability(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const vimeoId = parseVimeoVideoId(url);
  try {
    if (vimeoId) {
      const response = await fetchImpl(
        `${VIMEO_OEMBED_ENDPOINT}?url=${encodeURIComponent(url)}`
      );
      return {
        available: response.ok,
        reason: response.ok ? "vimeo_oembed" : `vimeo_oembed_${response.status}`,
      };
    }
    const response = await fetchImpl(url, { redirect: "follow" });
    return {
      available: response.ok,
      reason: response.ok ? "http_ok" : `http_${response.status}`,
    };
  } catch (error) {
    return {
      available: false,
      reason: "fetch_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
