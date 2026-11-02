/**
 * One-shot YouTube Movies deep-link resolution.
 * Prefer AI web search (resolveYoutubeMovieLinkViaAi); Data API search burns
 * daily quota (100 units/call). Not used in automatic Watch refresh.
 */
import { getTitleSimilarity } from "./film-duplicate-check.mjs";
import { parseJsonFromModelText } from "./film-discovery-workflow.mjs";

const YOUTUBE_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const YOUTUBE_MOVIES_CHANNEL = /^youtube movies$/i;
const WATCH_URL_RE =
  /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/i;

/**
 * @param {string | null | undefined} raw
 * @returns {{ url: string, videoId: string } | null}
 */
export function normalizeYoutubeWatchUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtu.be") {
    return null;
  }
  let videoId = null;
  if (host === "youtu.be") {
    videoId = parsed.pathname.replace(/^\//, "").split("/")[0] || null;
  } else {
    videoId = parsed.searchParams.get("v");
    if (!videoId) {
      const match = text.match(WATCH_URL_RE);
      videoId = match?.[1] ?? null;
    }
  }
  if (!videoId || !/^[a-zA-Z0-9_-]{6,}$/.test(videoId)) return null;
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

/**
 * @param {unknown} value
 * @returns {{ checked_at: string, url: string | null, videoId: string | null } | null}
 */
export function normalizeYoutubeLinks(value) {
  if (!value || typeof value !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (value);
  const checked_at =
    typeof row.checked_at === "string" && row.checked_at
      ? row.checked_at
      : null;
  if (!checked_at) return null;
  const normalized = normalizeYoutubeWatchUrl(row.url);
  return {
    checked_at,
    url: normalized?.url ?? null,
    videoId: normalized?.videoId ?? null,
  };
}

/**
 * @param {Array<{ provider?: string }>} offers
 */
export function offersIncludeYoutube(offers) {
  return (offers ?? []).some((offer) => offer?.provider === "YouTube");
}

/**
 * Drop YouTube rows from a watch offers list (TMDB false positives).
 * @param {Array<{ provider?: string, type?: string, regions?: string[] }>} offers
 */
export function stripYoutubeOffers(offers) {
  return (offers ?? []).filter((offer) => offer?.provider !== "YouTube");
}

// Prefer stripWatchProviders from film-watch-availability for new call sites.

/**
 * @param {string | null | undefined} iso
 */
export function youtubeDurationSeconds(iso) {
  const match = String(iso ?? "").match(
    /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i
  );
  if (!match) return 0;
  return (
    Number(match[1] || 0) * 3600 +
    Number(match[2] || 0) * 60 +
    Number(match[3] || 0)
  );
}

/**
 * Confirm a watch URL is a YouTube Movies feature (not a trailer).
 * Uses videos.list (1 quota unit) when apiKey is set.
 * @param {object} input
 * @param {string} input.videoId
 * @param {string} input.title
 * @param {string | null | undefined} [input.originalTitle]
 * @param {number | null | undefined} [input.year]
 * @param {string | null | undefined} [input.apiKey]
 * @param {typeof fetch} [input.fetchImpl]
 */
export async function verifyYoutubeMoviesVideo(input) {
  const videoId = String(input.videoId ?? "").trim();
  const title = String(input.title ?? "").trim();
  const apiKey = String(input.apiKey ?? "").trim();
  if (!videoId || !title || !apiKey) return false;
  const fetchImpl = input.fetchImpl ?? fetch;
  const originalTitle = String(input.originalTitle ?? "").trim();
  const year =
    input.year != null && Number.isFinite(Number(input.year))
      ? Number(input.year)
      : null;

  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    id: videoId,
    key: apiKey,
  });
  const response = await fetchImpl(`${YOUTUBE_VIDEOS}?${params}`);
  if (!response.ok) return false;
  const data = await response.json();
  const video = data.items?.[0];
  if (!video) return false;
  const channelTitle = String(video?.snippet?.channelTitle ?? "");
  if (!YOUTUBE_MOVIES_CHANNEL.test(channelTitle)) return false;
  const seconds = youtubeDurationSeconds(video?.contentDetails?.duration);
  if (seconds < 40 * 60) return false;
  const trackName = String(video?.snippet?.title ?? "");
  const titleSim = Math.max(
    getTitleSimilarity(title, trackName),
    getTitleSimilarity(originalTitle, trackName)
  );
  if (titleSim < 0.82) return false;
  if (year != null) {
    const blob = `${trackName}\n${video?.snippet?.description ?? ""}`;
    // Soft: year helps but many Movies pages omit it.
    void blob;
  }
  return true;
}

/**
 * Resolve via OpenAI web search (no YouTube search.list quota).
 * @param {object} input
 * @param {import("openai").default} input.openai
 * @param {string} input.title
 * @param {string | null | undefined} [input.originalTitle]
 * @param {number | null | undefined} [input.year]
 * @param {string | null | undefined} [input.apiKey] YouTube Data API key for verify
 * @param {string} [input.model]
 * @param {typeof fetch} [input.fetchImpl]
 */
export async function resolveYoutubeMovieLinkViaAi(input) {
  const title = String(input.title ?? "").trim();
  if (!title) return null;
  const year =
    input.year != null && Number.isFinite(Number(input.year))
      ? Number(input.year)
      : null;
  const originalTitle = String(input.originalTitle ?? "").trim();
  const model =
    input.model ||
    process.env.WATCH_YOUTUBE_LINK_MODEL ||
    process.env.WEEKLY_FILM_DISCOVERY_MODEL ||
    "gpt-4.1-mini";
  const yearPart = year != null ? String(year) : "";
  const q1 = `"${title}" ${yearPart} "YouTube Movies" site:youtube.com/watch`
    .replace(/\s+/g, " ")
    .trim();
  const q2 = originalTitle
    ? `"${originalTitle}" ${yearPart} "YouTube Movies" site:youtube.com/watch`
        .replace(/\s+/g, " ")
        .trim()
    : `"${title}" rent OR buy site:youtube.com/watch "YouTube Movies"`;

  const response = await input.openai.responses.create({
    model,
    temperature: 0,
    tools: [{ type: "web_search_preview" }],
    tool_choice: "required",
    input: [
      {
        role: "developer",
        content: `You are a link finder. Output MUST be a single JSON object and nothing else:
{"url":"https://www.youtube.com/watch?v=VIDEO_ID"|null,"confidence":"high"|"low"|"none"}

Call the web search tool with these exact query strings (copy verbatim, one search each):
QUERY_A: ${q1}
QUERY_B: ${q2}

Accept a result only if:
- it is a youtube.com/watch?v= or youtu.be link from search results
- the page is the full movie on the YouTube Movies channel (rent/buy)
Reject trailers, clips, reviews, and other channels.
Never invent a video id. If no qualifying result, {"url":null,"confidence":"none"}.
Do not write an essay or plot summary.`,
      },
      {
        role: "user",
        content: `Find YouTube Movies watch URL for: ${title}${originalTitle ? ` / ${originalTitle}` : ""}${yearPart ? ` (${yearPart})` : ""}`,
      },
    ],
  });

  const content =
    typeof response.output_text === "string" ? response.output_text : "";
  if (!content.trim()) return null;
  let parsed;
  try {
    parsed = parseJsonFromModelText(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const normalized = normalizeYoutubeWatchUrl(
    /** @type {Record<string, unknown>} */ (parsed).url
  );
  if (!normalized) return null;

  const apiKey = String(input.apiKey ?? "").trim();
  if (apiKey) {
    const ok = await verifyYoutubeMoviesVideo({
      videoId: normalized.videoId,
      title,
      originalTitle,
      year,
      apiKey,
      fetchImpl: input.fetchImpl,
    });
    if (!ok) return null;
  }
  return normalized;
}

/**
 * @param {object} input
 * @param {string} input.apiKey
 * @param {string} input.title
 * @param {string | null | undefined} [input.originalTitle]
 * @param {number | null | undefined} [input.year]
 * @param {typeof fetch} [input.fetchImpl]
 */
export async function resolveYoutubeMovieLink(input) {
  const apiKey = String(input.apiKey ?? "").trim();
  const title = String(input.title ?? "").trim();
  if (!apiKey || !title) return null;
  const year =
    input.year != null && Number.isFinite(Number(input.year))
      ? Number(input.year)
      : null;
  const originalTitle = String(input.originalTitle ?? "").trim();
  const fetchImpl = input.fetchImpl ?? fetch;

  const queries = [
    year != null ? `${title} ${year}` : title,
    originalTitle
      ? year != null
        ? `${originalTitle} ${year}`
        : originalTitle
      : null,
  ].filter(Boolean);

  /** @type {Map<string, { videoId: string, title: string, channelTitle: string }>} */
  const candidates = new Map();

  for (const q of [...new Set(queries)]) {
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      videoType: "movie",
      maxResults: "10",
      q,
      key: apiKey,
    });
    const response = await fetchImpl(`${YOUTUBE_SEARCH}?${params}`);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `YouTube search ${response.status}: ${text.slice(0, 160)}`
      );
    }
    const data = await response.json();
    for (const item of data.items ?? []) {
      const videoId = item?.id?.videoId;
      const channelTitle = String(item?.snippet?.channelTitle ?? "");
      if (!videoId || !YOUTUBE_MOVIES_CHANNEL.test(channelTitle)) continue;
      candidates.set(videoId, {
        videoId,
        title: String(item?.snippet?.title ?? ""),
        channelTitle,
      });
    }
  }

  if (!candidates.size) return null;

  const ids = [...candidates.keys()];
  const videosParams = new URLSearchParams({
    part: "snippet,contentDetails",
    id: ids.join(","),
    key: apiKey,
  });
  const videosResponse = await fetchImpl(`${YOUTUBE_VIDEOS}?${videosParams}`);
  if (!videosResponse.ok) {
    const text = await videosResponse.text().catch(() => "");
    throw new Error(
      `YouTube videos ${videosResponse.status}: ${text.slice(0, 160)}`
    );
  }
  const videosData = await videosResponse.json();

  /** @type {Array<{ videoId: string, title: string, score: number, seconds: number }>} */
  const scored = [];
  for (const video of videosData.items ?? []) {
    const videoId = String(video?.id ?? "");
    const trackName = String(video?.snippet?.title ?? "");
    const channelTitle = String(video?.snippet?.channelTitle ?? "");
    if (!videoId || !YOUTUBE_MOVIES_CHANNEL.test(channelTitle)) continue;
    const seconds = youtubeDurationSeconds(video?.contentDetails?.duration);
    if (seconds < 40 * 60) continue; // trailers / clips out
    const titleSim = Math.max(
      getTitleSimilarity(title, trackName),
      getTitleSimilarity(originalTitle, trackName)
    );
    if (titleSim < 0.82) continue;
    let score = titleSim;
    if (year != null) {
      const blob = `${trackName}\n${video?.snippet?.description ?? ""}`;
      if (blob.includes(String(year))) score += 0.1;
    }
    scored.push({ videoId, title: trackName, score, seconds });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return {
    videoId: best.videoId,
    url: `https://www.youtube.com/watch?v=${best.videoId}`,
  };
}
