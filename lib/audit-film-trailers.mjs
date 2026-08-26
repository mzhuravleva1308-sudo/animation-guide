import {
  checkNonYoutubeTrailerAvailability,
  checkYoutubeVideosAvailability,
  parseYoutubeVideoId,
} from "./youtube-trailer-availability.mjs";

export const TRAILER_AUDIT_ISSUE = {
  MISSING_TRAILER_URL: "missing_trailer_url",
  UNAVAILABLE: "unavailable",
  UNPARSEABLE_URL: "unparseable_url",
};

function youtubeIdForFilm(film) {
  return (
    (typeof film.trailer_video_id === "string" && film.trailer_video_id.trim()) ||
    parseYoutubeVideoId(film.trailer_url) ||
    null
  );
}

function isYoutubeUrl(url) {
  if (typeof url !== "string") return false;
  return /youtube\.com|youtu\.be/i.test(url);
}

/**
 * Read-only audit of film trailer URLs.
 *
 * @param {Array<{
 *   id: string,
 *   title?: string | null,
 *   year?: number | null,
 *   media_type?: string | null,
 *   catalog_visible?: boolean | null,
 *   trailer_url?: string | null,
 *   trailer_video_id?: string | null,
 *   trailer_source?: string | null,
 * }>} films
 * @param {{
 *   apiKey?: string | null,
 *   fetchImpl?: typeof fetch,
 * }} [options]
 */
export async function auditFilmTrailers(films, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const rows = films ?? [];
  const missing = [];
  const youtube = [];
  const other = [];

  for (const film of rows) {
    const url =
      typeof film.trailer_url === "string" ? film.trailer_url.trim() : "";
    if (!url) {
      missing.push(film);
      continue;
    }
    const videoId = youtubeIdForFilm(film);
    if (videoId || isYoutubeUrl(url)) {
      youtube.push({ film, videoId, url });
    } else {
      other.push({ film, url });
    }
  }

  const ytResults = await checkYoutubeVideosAvailability(
    youtube.map((row) => row.videoId).filter(Boolean),
    { apiKey: options.apiKey, fetchImpl }
  );

  const broken = [];

  for (const { film, videoId, url } of youtube) {
    if (!videoId) {
      broken.push(issueRow(film, TRAILER_AUDIT_ISSUE.UNPARSEABLE_URL, url));
      continue;
    }
    const check = ytResults.get(videoId);
    if (!check?.available) {
      broken.push(
        issueRow(
          film,
          check?.reason ?? TRAILER_AUDIT_ISSUE.UNAVAILABLE,
          url,
          videoId
        )
      );
    }
  }

  for (const { film, url } of other) {
    const check = await checkNonYoutubeTrailerAvailability(url, { fetchImpl });
    if (!check.available) {
      broken.push(issueRow(film, check.reason, url));
    }
  }

  const byMediaType = (list) => {
    const counts = {};
    for (const film of list) {
      const key = film.media_type || "unknown";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  };

  return {
    total: rows.length,
    withTrailer: rows.length - missing.length,
    missingTrailer: missing.length,
    brokenTrailer: broken.length,
    missingByMediaType: byMediaType(missing),
    brokenByMediaType: byMediaType(broken),
    missing: missing.map((film) => ({
      id: film.id,
      title: film.title ?? null,
      year: film.year ?? null,
      media_type: film.media_type ?? null,
      catalog_visible: film.catalog_visible ?? null,
    })),
    broken,
  };
}

function issueRow(film, issue, url, videoId = null) {
  return {
    id: film.id,
    title: film.title ?? null,
    year: film.year ?? null,
    media_type: film.media_type ?? null,
    catalog_visible: film.catalog_visible ?? null,
    trailer_url: url,
    trailer_source: film.trailer_source ?? null,
    video_id: videoId,
    issue,
  };
}
