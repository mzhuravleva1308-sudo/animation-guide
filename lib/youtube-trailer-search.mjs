import { getTitleSimilarity } from "./tmdb-film-matching.mjs";
import {
  OFFICIAL_FESTIVAL_CHANNELS,
  VERIFIED_DISTRIBUTOR_CHANNELS,
  getTrustedClipChannelReason,
  normalizeChannelName,
} from "./tmdb-trailer-selection.mjs";

const COMMON_TITLE_MAX_LENGTH = 10;
const YOUTUBE_SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const MIN_ACCEPT_SCORE = 55;

const CHANNEL_AUTHORITY = {
  studio_distributor: 5,
  festival: 4,
  filmmaker_production: 3,
  recognised_media: 2,
  other: 1,
};

const COMMON_SINGLE_WORD_TITLES = new Set([
  "love",
  "home",
  "life",
  "night",
  "dream",
  "storm",
  "square",
  "tana",
  "chao",
  "wave",
  "waves",
  "fire",
  "water",
  "earth",
  "wind",
  "soul",
  "heart",
  "shadow",
  "light",
  "dark",
  "star",
  "moon",
  "sun",
  "river",
  "forest",
  "city",
  "girl",
  "boy",
  "man",
  "woman",
  "child",
  "world",
  "time",
  "story",
  "ghost",
  "angel",
  "demon",
  "king",
  "queen",
  "hero",
  "zero",
  "one",
  "run",
  "flow",
  "bloom",
  "pulse",
]);

const RECOGNISED_MEDIA_CHANNELS = [
  "movieclips",
  "movieclips trailers",
  "rotten tomatoes trailers",
  "rotten tomatoes",
  "ign",
  "ign movie trailers",
  "collider",
  "variety",
  "indiewire",
  "screenrant",
  "netflix",
];

const EXCLUDED_TITLE_PATTERNS = [
  /\breview(s|er|ing)?\b/i,
  /\breaction(s)?\b/i,
  /\bfan(\s|-)?(made|trailer|edit|film|animation)\b/i,
  /\b(unofficial|fanmade)\b/i,
  /\b(clip|clips|scene|excerpt|deleted\s+scene)\b/i,
  /\b(explained|ending|spoilers?|recap|breakdown)\b/i,
  /\b(reaction\s+mashup|honest\s+trailer)\b/i,
  /\bgacha(\s|-)?(life|club)?\b/i,
  /\bmeme\b/i,
  /\bamv\b/i,
  /\b(fan\s+)?edit\b/i,
  /\bgameplay\b/i,
];

const OFFICIAL_TRAILER_PATTERN = /\bofficial\s+trailer\b/i;
const OFFICIAL_TEASER_PATTERN = /\bofficial\s+teaser\b/i;
const TRAILER_WORD_PATTERN = /\b(trailer|tr[aá]iler|bande[-\s]?annonce)\b/i;
const TEASER_WORD_PATTERN = /\bteaser\b/i;
const ANIMATION_CONTEXT_PATTERN =
  /\b(animat(?:ed|ion)|anime|stop[-\s]?motion|puppet|drawn)\b/i;
const FESTIVAL_CHANNEL_PATTERN =
  /\b(festival|annecy|cannes|berlinale|sundance|feff|far east film)\b/i;
const STUDIO_DISTRIBUTOR_CHANNEL_PATTERN =
  /\b(pictures|films|studios?|distribution|releasing|entertainment)\b/i;

/**
 * Detect English + localized "official trailer/teaser" wording.
 * Examples: "Teaser Trailer Ufficiale", "Bande-annonce officielle",
 * "Tráiler oficial", "Offizieller Trailer".
 */
export function hasOfficialTrailerWording(text) {
  const value = String(text ?? "");
  if (OFFICIAL_TRAILER_PATTERN.test(value)) return true;
  if (/\boffizieller\s+trailer\b/i.test(value)) return true;
  if (/\btr[aá]iler\s+oficial\b/i.test(value)) return true;
  if (/\bbande[-\s]?annonce\s+officielle?\b/i.test(value)) return true;
  return (
    /\b(trailer|tr[aá]iler|bande[-\s]?annonce)\b[\s\S]{0,24}\b(ufficiale|officielle?|oficial|offiziell(?:er|es|e)?|official)\b/i.test(
      value
    ) ||
    /\b(ufficiale|officielle?|oficial|offiziell(?:er|es|e)?|official)\b[\s\S]{0,24}\b(trailer|tr[aá]iler|bande[-\s]?annonce)\b/i.test(
      value
    )
  );
}

export function hasOfficialTeaserWording(text) {
  const value = String(text ?? "");
  if (OFFICIAL_TEASER_PATTERN.test(value)) return true;
  return (
    /\bteaser(?:\s+trailer)?\b[\s\S]{0,24}\b(ufficiale|officielle?|oficial|offiziell(?:er|es|e)?|official)\b/i.test(
      value
    ) ||
    /\b(ufficiale|officielle?|oficial|offiziell(?:er|es|e)?|official)\b[\s\S]{0,24}\bteaser\b/i.test(
      value
    )
  );
}


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

function tokenize(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((word) => word.length > 2)
  );
}

function getTokenOverlap(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  return (
    [...tokensA].filter((token) => tokensB.has(token)).length /
    Math.min(tokensA.size, tokensB.size)
  );
}

export function isAmbiguousFilmTitle(title) {
  const normalized = normalizeText(title);
  if (!normalized) return false;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 1) return true;
  if (normalized.length <= COMMON_TITLE_MAX_LENGTH) return true;
  if (words.length === 1 && COMMON_SINGLE_WORD_TITLES.has(words[0])) return true;
  if (words.every((word) => COMMON_SINGLE_WORD_TITLES.has(word)) && words.length <= 2) {
    return true;
  }
  return false;
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
    queries.push(`${title} ${yearPart} official teaser`);
  } else if (title) {
    queries.push(`${title} official trailer`);
  }

  if (
    originalTitle &&
    normalizeText(originalTitle) !== normalizeText(title)
  ) {
    if (yearPart) {
      queries.push(`${originalTitle} ${yearPart} trailer`);
      queries.push(`${originalTitle} ${yearPart} teaser`);
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
  return `${candidate.title ?? ""} ${candidate.description ?? ""} ${candidate.channelTitle ?? ""}`;
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

  const countries = String(film.country ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    director_names: directors,
    production_companies: [],
    distributors: [],
    creators: directors,
    countries,
  };
}

function channelMatchesAny(channelName, names) {
  const channel = normalizeChannelName(channelName);
  if (!channel) return false;
  return names.some((name) => {
    const normalizedName = normalizeChannelName(name);
    return (
      Boolean(normalizedName) &&
      (channel === normalizedName ||
        channel.includes(normalizedName) ||
        normalizedName.includes(channel))
    );
  });
}

function textIncludesName(text, name) {
  const normalizedText = normalizeText(text);
  const normalizedName = normalizeText(name);
  if (!normalizedText || !normalizedName || normalizedName.length < 3) {
    return false;
  }
  return (
    normalizedText === normalizedName ||
    normalizedText.includes(normalizedName)
  );
}

/**
 * Channel authority for equal-score tie-breaks:
 * studio/distributor > festival > filmmaker/production > recognised media > other
 */
export function classifyYoutubeChannelAuthority(channelTitle, film = {}) {
  const normalized = normalizeChannelName(channelTitle);
  const hints = buildChannelHints(film);

  if (!normalized) {
    return { tier: "other", rank: CHANNEL_AUTHORITY.other };
  }

  if (
    VERIFIED_DISTRIBUTOR_CHANNELS.has(normalized) ||
    (STUDIO_DISTRIBUTOR_CHANNEL_PATTERN.test(normalized) &&
      !FESTIVAL_CHANNEL_PATTERN.test(normalized))
  ) {
    return {
      tier: "studio_distributor",
      rank: CHANNEL_AUTHORITY.studio_distributor,
    };
  }

  if (
    channelMatchesAny(channelTitle, OFFICIAL_FESTIVAL_CHANNELS) ||
    FESTIVAL_CHANNEL_PATTERN.test(normalized)
  ) {
    return { tier: "festival", rank: CHANNEL_AUTHORITY.festival };
  }

  if (
    channelMatchesAny(channelTitle, [
      ...hints.director_names,
      ...hints.creators,
      ...hints.production_companies,
    ])
  ) {
    return {
      tier: "filmmaker_production",
      rank: CHANNEL_AUTHORITY.filmmaker_production,
    };
  }

  if (channelMatchesAny(channelTitle, RECOGNISED_MEDIA_CHANNELS)) {
    return {
      tier: "recognised_media",
      rank: CHANNEL_AUTHORITY.recognised_media,
    };
  }

  return { tier: "other", rank: CHANNEL_AUTHORITY.other };
}

/**
 * Extra confirmations required for short/ambiguous titles.
 * Exact title + year + generic "animation" wording is not enough.
 */
export function collectStrongYoutubeConfirmations(film, candidate, channelAuthority) {
  const confirmations = [];
  const text = `${candidate.title ?? ""} ${candidate.description ?? ""}`;
  const hints = buildChannelHints(film);
  const filmTitle = normalizeText(film.title);
  const filmOriginal = normalizeText(film.original_title);

  if (
    filmOriginal &&
    filmOriginal !== filmTitle &&
    textIncludesName(candidate.title, film.original_title)
  ) {
    confirmations.push("original_title");
  }

  for (const director of hints.director_names) {
    if (
      textIncludesName(text, director) ||
      channelMatchesAny(candidate.channelTitle, [director])
    ) {
      confirmations.push(`director:${director}`);
      break;
    }
  }

  if (channelAuthority?.tier === "studio_distributor") {
    confirmations.push("studio_or_distributor_channel");
  }

  if (channelAuthority?.tier === "festival") {
    confirmations.push("official_festival_channel");
  }

  if (channelAuthority?.tier === "filmmaker_production") {
    confirmations.push("filmmaker_or_production_channel");
  }

  const channelReason = getTrustedClipChannelReason(
    candidate.channelTitle,
    hints
  );
  if (channelReason) {
    confirmations.push("trusted_official_channel");
  }

  for (const country of hints.countries) {
    if (textIncludesName(text, country)) {
      confirmations.push(`country:${country}`);
      break;
    }
  }

  if (
    film.synopsis &&
    getTokenOverlap(film.synopsis, candidate.description ?? "") >= 0.2
  ) {
    confirmations.push("synopsis_overlap");
  }

  return [...new Set(confirmations)];
}

export function scoreYoutubeTrailerCandidate(film, candidate) {
  const channelAuthority = classifyYoutubeChannelAuthority(
    candidate.channelTitle,
    film
  );

  if (isExcludedYoutubeTrailerCandidate(candidate)) {
    return {
      accepted: false,
      score: 0,
      channelAuthority,
      strongConfirmations: [],
      reasons: ["hard-rejected by title/description/channel pattern"],
    };
  }

  const reasons = [];
  let score = 0;
  const text = `${candidate.title ?? ""} ${candidate.description ?? ""}`;
  const titleMatch = titleExactMatch(film, candidate.title);
  const ambiguous = isAmbiguousFilmTitle(film.title);
  const strongConfirmations = collectStrongYoutubeConfirmations(
    film,
    candidate,
    channelAuthority
  );

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
      channelAuthority,
      strongConfirmations,
      reasons: ["rejected: title is not a sufficiently strong match"],
    };
  }

  const year = yearMatch(film, candidate);
  if (year.matched) {
    score += 20;
    reasons.push(year.reason);
  } else if (Number.isFinite(Number(film.year)) && ambiguous) {
    return {
      accepted: false,
      score,
      channelAuthority,
      strongConfirmations,
      reasons: [...reasons, "rejected: ambiguous title without year match"],
    };
  }

  if (hasOfficialTrailerWording(text)) {
    score += 30;
    reasons.push("official trailer wording");
  } else if (hasOfficialTeaserWording(text)) {
    score += 25;
    reasons.push("official teaser wording");
  } else if (TRAILER_WORD_PATTERN.test(text)) {
    score += 12;
    reasons.push("trailer wording");
  } else if (TEASER_WORD_PATTERN.test(text)) {
    score += 10;
    reasons.push("teaser wording");
  }

  if (strongConfirmations.length) {
    score += 25;
    reasons.push(`strong confirmations: ${strongConfirmations.join(", ")}`);
  }

  if (ANIMATION_CONTEXT_PATTERN.test(text)) {
    score += 15;
    reasons.push("animation context");
  } else if (ambiguous && !strongConfirmations.length) {
    score -= 10;
    reasons.push("ambiguous title lacks animation context");
  }

  const titleStrong = Boolean(titleMatch.exact || titleMatch.similarity >= 80);
  let accepted = false;

  if (!titleStrong || score < MIN_ACCEPT_SCORE) {
    accepted = false;
  } else if (ambiguous) {
    if (strongConfirmations.length === 0) {
      reasons.push(
        "rejected: ambiguous title needs strong confirmation beyond exact title"
      );
      accepted = false;
    } else {
      accepted = true;
    }
  } else {
    accepted =
      hasOfficialTrailerWording(text) ||
      hasOfficialTeaserWording(text) ||
      strongConfirmations.length > 0 ||
      channelAuthority.tier === "festival" ||
      channelAuthority.tier === "studio_distributor" ||
      (year.matched && ANIMATION_CONTEXT_PATTERN.test(text)) ||
      (year.matched && TRAILER_WORD_PATTERN.test(text) && score >= 70);
  }

  return {
    accepted,
    score,
    channelAuthority,
    strongConfirmations,
    reasons,
  };
}

export function compareYoutubeTrailerCandidates(a, b) {
  if (b.evaluation.score !== a.evaluation.score) {
    return b.evaluation.score - a.evaluation.score;
  }

  const authorityDifference =
    (b.evaluation.channelAuthority?.rank ?? CHANNEL_AUTHORITY.other) -
    (a.evaluation.channelAuthority?.rank ?? CHANNEL_AUTHORITY.other);
  if (authorityDifference !== 0) {
    return authorityDifference;
  }

  return String(a.candidate.videoId ?? "").localeCompare(
    String(b.candidate.videoId ?? "")
  );
}

export function selectBestYoutubeTrailer(film, candidates = []) {
  const ranked = candidates
    .filter((candidate) => candidate?.videoId)
    .map((candidate) => ({
      candidate,
      evaluation: scoreYoutubeTrailerCandidate(film, candidate),
    }))
    .sort(compareYoutubeTrailerCandidates);

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
    channelAuthority: best.evaluation.channelAuthority,
    strongConfirmations: best.evaluation.strongConfirmations,
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
