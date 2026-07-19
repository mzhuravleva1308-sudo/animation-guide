import { getTitleSimilarity } from "./tmdb-film-matching.mjs";
import { getTrustedClipChannelReason } from "./tmdb-trailer-selection.mjs";

const COMMON_TITLE_MAX_LENGTH = 10;
const YOUTUBE_SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const MIN_ACCEPT_SCORE = 55;

const EXCLUDED_TITLE_PATTERNS = [
  /\breview(s|er|ing)?\b/i,
  /\breaction(s)?\b/i,
  /\bfan(\s|-)?(made|trailer|edit|film)\b/i,
  /\b(unofficial|fanmade)\b/i,
  /\b(clip|clips|scene|excerpt|deleted\s+scene)\b/i,
  /\b(explained|ending|spoilers?|recap|breakdown)\b/i,
  /\b(reaction\s+mashup|honest\s+trailer)\b/i,
];

const OFFICIAL_TRAILER_PATTERN = /\bofficial\s+trailer\b/i;
const OFFICIAL_TEASER_PATTERN = /\bofficial\s+teaser\b/i;
const TRAILER_WORD_PATTERN = /\btrailer\b/i;
const TEASER_WORD_PATTERN = /\bteaser\b/i;
const ANIMATION_CONTEXT_PATTERN =
  /\b(animat(?:ed|ion)|anime|stop[-\s]?motion|puppet|drawn)\b/i;

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^the\s+/, "")
    .replace(/^a\s+/, "")
    .replace(/^an\s+/, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function isAmbiguousFilmTitle(title) {
  const normalized = normalizeText(title);
  if (!normalized) return false;
  return (
    normalized.length <= COMMON_TITLE_MAX_LENGTH ||
    normalized.split(" ").filter(Boolean).length === 1
  );
}

export function buildYoutubeTrailerQueries(film) {
  const year = Number(film.year);
  const yearPart = Number.isFinite(year) ? String(year) : "";
  const title = String(film.title ?? "").trim();
  const originalTitle = String(film.original_title ?? "").trim();
  const ambiguous = isAmbiguousFilmTitle(title);
  const queries = [];

  if (title && yearPart) {
    queries.push(`${title} ${yearPart} official trailer`);
  } else if (title) {
    queries.push(`${title} official trailer`);
  }

  if (
    originalTitle &&
    normalizeText(originalTitle) !== normalizeText(title)
  ) {
    if (yearPart) {
      queries.push(`${originalTitle} ${yearPart} trailer`);
    } else {
      queries.push(`${originalTitle} trailer`);
    }
  }

  if (ambiguous && title) {
    if (yearPart) {
      queries.push(`${title} ${yearPart} animation official trailer`);
      queries.push(`${title} ${yearPart} animated trailer`);
    } else {
      queries.push(`${title} animation official trailer`);
    }
  }

  return uniqueStrings(queries);
}

export function buildYoutubeWatchUrl(videoId) {
  if (!videoId) return null;
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function buildTrailerSourceRecord({ provider, videoId, url }) {
  return {
    provider: provider ?? null,
    video_id: videoId ?? null,
    url: url ?? null,
  };
}

function getCandidateText(candidate) {
  return `${candidate.title ?? ""} ${candidate.description ?? ""}`;
}

export function isExcludedYoutubeTrailerCandidate(candidate) {
  const text = getCandidateText(candidate);
  return EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

function titleExactMatch(film, candidateTitle) {
  const videoTitle = normalizeText(candidateTitle);
  const filmTitle = normalizeText(film.title);
  const filmOriginal = normalizeText(film.original_title);

  if (!videoTitle) return { exact: false, similarity: 0, matchedField: null };

  if (filmTitle && (videoTitle === filmTitle || videoTitle.includes(filmTitle))) {
    return { exact: true, similarity: 100, matchedField: "title" };
  }

  if (
    filmOriginal &&
    (videoTitle === filmOriginal || videoTitle.includes(filmOriginal))
  ) {
    return { exact: true, similarity: 100, matchedField: "original_title" };
  }

  const similarity = Math.max(
    getTitleSimilarity(film.title, candidateTitle),
    getTitleSimilarity(film.original_title, candidateTitle)
  );

  return {
    exact: false,
    similarity,
    matchedField: similarity >= 80 ? "fuzzy_title" : null,
  };
}

function yearMatch(film, candidate) {
  const filmYear = Number(film.year);
  if (!Number.isFinite(filmYear)) {
    return { matched: false, reason: null };
  }

  const titleHasYear = new RegExp(`\\b${filmYear}\\b`).test(
    String(candidate.title ?? "")
  );
  const publishedYear = candidate.publishedAt
    ? Number(String(candidate.publishedAt).slice(0, 4))
    : null;
  const publishedNear =
    Number.isFinite(publishedYear) && Math.abs(publishedYear - filmYear) <= 1;

  if (titleHasYear) {
    return { matched: true, reason: "year in title" };
  }
  if (publishedNear) {
    return { matched: true, reason: "published year near film year" };
  }
  return { matched: false, reason: null };
}

function buildChannelHints(film) {
  const directors = String(film.director ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    director_names: directors,
    production_companies: [],
    distributors: [],
    creators: directors,
  };
}

export function scoreYoutubeTrailerCandidate(film, candidate) {
  if (isExcludedYoutubeTrailerCandidate(candidate)) {
    return {
      accepted: false,
      score: 0,
      reasons: ["excluded by title/description pattern"],
    };
  }

  const reasons = [];
  let score = 0;
  const text = getCandidateText(candidate);
  const titleMatch = titleExactMatch(film, candidate.title);

  if (titleMatch.exact) {
    score += 45;
    reasons.push(`exact ${titleMatch.matchedField} in video title`);
  } else if (titleMatch.similarity >= 80) {
    score += 25;
    reasons.push(`strong title similarity (${Math.round(titleMatch.similarity)})`);
  } else if (titleMatch.similarity >= 60) {
    score += 10;
    reasons.push(`partial title similarity (${Math.round(titleMatch.similarity)})`);
  } else {
    return {
      accepted: false,
      score: 0,
      reasons: ["rejected: title is not a sufficiently strong match"],
    };
  }

  const year = yearMatch(film, candidate);
  if (year.matched) {
    score += 20;
    reasons.push(year.reason);
  } else if (Number.isFinite(Number(film.year)) && isAmbiguousFilmTitle(film.title)) {
    return {
      accepted: false,
      score,
      reasons: [...reasons, "rejected: ambiguous title without year match"],
    };
  }

  if (OFFICIAL_TRAILER_PATTERN.test(text)) {
    score += 30;
    reasons.push("official trailer wording");
  } else if (OFFICIAL_TEASER_PATTERN.test(text)) {
    score += 25;
    reasons.push("official teaser wording");
  } else if (TRAILER_WORD_PATTERN.test(text)) {
    score += 12;
    reasons.push("trailer wording");
  } else if (TEASER_WORD_PATTERN.test(text)) {
    score += 10;
    reasons.push("teaser wording");
  }

  const channelReason = getTrustedClipChannelReason(
    candidate.channelTitle,
    buildChannelHints(film)
  );
  if (channelReason) {
    score += 35;
    reasons.push(channelReason);
  }

  if (ANIMATION_CONTEXT_PATTERN.test(text)) {
    score += 15;
    reasons.push("animation context");
  } else if (isAmbiguousFilmTitle(film.title) && !channelReason) {
    score -= 10;
    reasons.push("ambiguous title lacks animation context");
  }

  const accepted =
    score >= MIN_ACCEPT_SCORE &&
    Boolean(titleMatch.exact || titleMatch.similarity >= 80) &&
    (OFFICIAL_TRAILER_PATTERN.test(text) ||
      OFFICIAL_TEASER_PATTERN.test(text) ||
      Boolean(channelReason) ||
      (year.matched && ANIMATION_CONTEXT_PATTERN.test(text)) ||
      (year.matched && TRAILER_WORD_PATTERN.test(text) && score >= 70));

  return {
    accepted,
    score,
    reasons,
  };
}

export function selectBestYoutubeTrailer(film, candidates = []) {
  const ranked = candidates
    .filter((candidate) => candidate?.videoId)
    .map((candidate) => ({
      candidate,
      evaluation: scoreYoutubeTrailerCandidate(film, candidate),
    }))
    .sort((a, b) => b.evaluation.score - a.evaluation.score);

  const best = ranked.find((item) => item.evaluation.accepted);
  if (!best) {
    return null;
  }

  const url = buildYoutubeWatchUrl(best.candidate.videoId);
  return {
    ...buildTrailerSourceRecord({
      provider: "youtube",
      videoId: best.candidate.videoId,
      url,
    }),
    score: best.evaluation.score,
    reasons: best.evaluation.reasons,
    title: best.candidate.title ?? null,
    channelTitle: best.candidate.channelTitle ?? null,
  };
}

function mapSearchItem(item) {
  return {
    videoId: item?.id?.videoId ?? null,
    title: item?.snippet?.title ?? "",
    description: item?.snippet?.description ?? "",
    channelTitle: item?.snippet?.channelTitle ?? "",
    publishedAt: item?.snippet?.publishedAt ?? null,
  };
}

export async function searchYoutubeTrailers({
  apiKey,
  film,
  fetchImpl = fetch,
  maxResultsPerQuery = 8,
} = {}) {
  if (!apiKey) {
    return null;
  }

  const queries = buildYoutubeTrailerQueries(film);
  const byVideoId = new Map();

  for (const query of queries) {
    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: String(maxResultsPerQuery),
      q: query,
      key: apiKey,
    });

    const response = await fetchImpl(
      `${YOUTUBE_SEARCH_ENDPOINT}?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`YouTube search failed (${response.status}) for "${query}"`);
    }

    const data = await response.json();
    for (const item of data.items ?? []) {
      const mapped = mapSearchItem(item);
      if (!mapped.videoId || byVideoId.has(mapped.videoId)) continue;
      byVideoId.set(mapped.videoId, mapped);
    }
  }

  return selectBestYoutubeTrailer(film, [...byVideoId.values()]);
}
