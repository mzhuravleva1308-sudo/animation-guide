import { getTitleSimilarity } from "./tmdb-film-matching.mjs";
import {
  OFFICIAL_FESTIVAL_CHANNELS,
  VERIFIED_DISTRIBUTOR_CHANNELS,
  getTrustedClipChannelReason,
  normalizeChannelName,
} from "./tmdb-trailer-selection.mjs";
import { createYoutubeAvailabilityChecker } from "./youtube-trailer-availability.mjs";

const COMMON_TITLE_MAX_LENGTH = 10;
const YOUTUBE_SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
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
const ENGLISH_SUBTITLE_PATTERN =
  /(?:\b(?:with\s+)?english\s+(?:subtitles?|subs?|cc)\b|\beng(?:lish)?\s*sub(?:s|titles?|bed)?\b|\b(?:subtitles?|subs?)\s*(?:[:\-|]\s*)?(?:english|eng)\b|\[[^\]]*\bst\s*en\b[^\]]*\]|\b[a-z]{2,}\s*\/\s*english\b|\([^\)]*\benglish\b[^\)]*\))/i;
const ENGLISH_AUDIO_PATTERN =
  /\b(english\s+(?:audio|dub(?:bed)?|version|trailer)|eng(?:lish)?\s*dub(?:bed)?)\b/i;
const ENGLISH_ACCESS_PATTERN =
  /\b(english\s+(?:audio|dub(?:bed)?|subtitles?|subs?|cc|trailer|version)|eng\s*sub(?:bed)?|with\s+english\s+subtitles?)\b/i;
const EXPLICIT_NON_ENGLISH_PATTERN =
  /\b(french|german|italian|spanish|portuguese|polish|czech|hungarian|romanian|russian|japanese|korean|mandarin|cantonese)\s+(?:audio|dub(?:bed)?|version|trailer)\b/i;

/** ISO 639-1 → English language name for YouTube recall queries. */
const ORIGINAL_LANGUAGE_QUERY_NAMES = {
  cs: "Czech",
  fr: "French",
  de: "German",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  pl: "Polish",
  hu: "Hungarian",
  ro: "Romanian",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  cn: "Chinese",
  da: "Danish",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  fi: "Finnish",
  ar: "Arabic",
  fa: "Persian",
  tr: "Turkish",
  hi: "Hindi",
  th: "Thai",
  vi: "Vietnamese",
  uk: "Ukrainian",
};

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
    queries.push(`${title} ${yearPart} official trailer English`);
    queries.push(`${title} ${yearPart} official trailer English subtitles`);
    queries.push(`${title} ${yearPart} official trailer`);
    queries.push(`${title} ${yearPart} official teaser`);
  } else if (title) {
    queries.push(`${title} official trailer English`);
    queries.push(`${title} official trailer English subtitles`);
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

/**
 * Recall queries for non-English original audio + English subtitles.
 * Used when a selected trailer is non-English and has no EN-sub signal.
 */
export function buildYoutubeOriginalWithEnglishSubsQueries(
  film,
  originalLanguage = null
) {
  const year = Number(film.year);
  const yearPart = Number.isFinite(year) ? String(year) : "";
  const title = String(film.title ?? "").trim();
  const originalTitle = String(film.original_title ?? "").trim();
  const languageCode =
    normalizeTrailerLanguageCode(originalLanguage) ??
    normalizeTrailerLanguageCode(film.original_language);
  const languageName = languageCode
    ? ORIGINAL_LANGUAGE_QUERY_NAMES[languageCode] ?? null
    : null;
  const queries = [];

  const pushVariants = (base) => {
    if (!base) return;
    queries.push(`${base} English subtitles`);
    queries.push(`${base} eng sub`);
    queries.push(`${base} English Subs`);
  };

  if (title && yearPart) {
    pushVariants(`${title} ${yearPart} official trailer`);
    pushVariants(`${title} ${yearPart} trailer`);
  } else if (title) {
    pushVariants(`${title} official trailer`);
    pushVariants(`${title} trailer`);
  }

  if (
    originalTitle &&
    normalizeText(originalTitle) !== normalizeText(title)
  ) {
    if (yearPart) {
      pushVariants(`${originalTitle} ${yearPart} trailer`);
      pushVariants(`${originalTitle} ${yearPart} official trailer`);
    } else {
      pushVariants(`${originalTitle} trailer`);
    }
  }

  if (languageName && title) {
    if (yearPart) {
      pushVariants(`${title} ${yearPart} ${languageName} trailer`);
    } else {
      pushVariants(`${title} ${languageName} trailer`);
    }
  }

  return uniqueStrings(queries);
}

export function hasEnglishSubtitleSignal(text) {
  return ENGLISH_SUBTITLE_PATTERN.test(String(text ?? ""));
}

export function hasEnglishAudioSignal(text) {
  return ENGLISH_AUDIO_PATTERN.test(String(text ?? ""));
}

export function normalizeTrailerLanguageCode(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return /^[a-z]{2}$/.test(normalized) ? normalized : null;
}

/**
 * Non-English trailer without English-subtitle signal → upgrade via YouTube.
 * English trailers never upgrade. Unknown language is treated as non-English.
 */
export function trailerNeedsEnglishSubtitleUpgrade({
  languageCode = null,
  text = "",
} = {}) {
  const lang = normalizeTrailerLanguageCode(languageCode);
  if (lang === "en") {
    return false;
  }
  if (hasEnglishSubtitleSignal(text)) {
    return false;
  }
  return true;
}

/**
 * True when catalog title and original title differ (localized original vs English release).
 */
export function filmHasDistinctOriginalTitle(film) {
  const englishTitle = normalizeText(film?.title);
  const originalTitle = normalizeText(film?.original_title);
  return Boolean(englishTitle && originalTitle && englishTitle !== originalTitle);
}

/**
 * Video title uses the English release name, not the distinct original-language title.
 * Used as a soft English-access signal when metadata omits language (e.g. Free Jimmy).
 */
export function candidateUsesEnglishReleaseTitle(film, candidateTitle) {
  if (!filmHasDistinctOriginalTitle(film)) {
    return false;
  }
  const videoTitle = normalizeText(candidateTitle);
  const englishTitle = normalizeText(film.title);
  const originalTitle = normalizeText(film.original_title);
  if (!videoTitle || !englishTitle) {
    return false;
  }
  const usesEnglish =
    videoTitle === englishTitle || videoTitle.includes(englishTitle);
  const usesOriginal =
    Boolean(originalTitle) &&
    (videoTitle === originalTitle || videoTitle.includes(originalTitle));
  return usesEnglish && !usesOriginal;
}

/** Localized trailer wording that should not be treated as an English release cut.
 * Do not match plain English "trailer" (tr[aá]iler would). */
const LOCALIZED_TRAILER_MARKER_PATTERN =
  /\b(bande[-\s]?annonce|tr[áÁ]iler|offizieller|ufficiale|en\s+vf|version\s+fran[cç]aise)\b/i;

/**
 * @param {object} candidate
 * @param {{ film?: { title?: string | null, original_title?: string | null } | null }} [options]
 */
export function evaluateYoutubeTrailerLanguage(candidate, { film = null } = {}) {
  const audioLanguage = String(candidate?.defaultAudioLanguage ?? "")
    .trim()
    .toLowerCase();
  const defaultLanguage = String(candidate?.defaultLanguage ?? "")
    .trim()
    .toLowerCase();
  const text = `${candidate?.title ?? ""} ${candidate?.description ?? ""}`;
  const hasEnglishSubtitles = hasEnglishSubtitleSignal(text);
  const hasEnglishAudio =
    audioLanguage === "en" ||
    audioLanguage.startsWith("en-") ||
    defaultLanguage === "en" ||
    defaultLanguage.startsWith("en-") ||
    hasEnglishAudioSignal(text);

  if (hasEnglishAudio) {
    return {
      status: "english_accessible",
      reason: "English audio metadata/wording",
      hasEnglishAudio: true,
      hasEnglishSubtitles,
    };
  }
  if (hasEnglishSubtitles || ENGLISH_ACCESS_PATTERN.test(text)) {
    return {
      status: "english_accessible",
      reason: "English subtitle wording",
      hasEnglishAudio: false,
      hasEnglishSubtitles: true,
    };
  }
  if (
    (audioLanguage && audioLanguage !== "und") ||
    EXPLICIT_NON_ENGLISH_PATTERN.test(text)
  ) {
    return {
      status: "non_english",
      reason: "explicit non-English audio/version",
      hasEnglishAudio: false,
      hasEnglishSubtitles: false,
    };
  }
  // English release title on a film with a distinct original title ≈ English cut
  // (common when YouTube omits defaultAudioLanguage / "English" wording).
  if (
    film &&
    candidateUsesEnglishReleaseTitle(film, candidate?.title) &&
    !LOCALIZED_TRAILER_MARKER_PATTERN.test(text)
  ) {
    return {
      status: "english_accessible",
      reason: "English release title version",
      hasEnglishAudio: false,
      hasEnglishSubtitles: false,
    };
  }
  return {
    status: "uncertain",
    reason: "language not declared",
    hasEnglishAudio: false,
    hasEnglishSubtitles: false,
  };
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

function compactTitle(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function titleExactMatch(film, candidateTitle) {
  const videoTitle = normalizeText(candidateTitle);
  const filmTitle = normalizeText(film.title);
  const filmOriginal = normalizeText(film.original_title);
  const compactVideo = compactTitle(candidateTitle);
  const compactFilm = compactTitle(film.title);
  const compactOriginal = compactTitle(film.original_title);

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

  // Handles mashed titles like "TheArtofHappiness" vs "The Art of Happiness".
  if (
    compactFilm &&
    compactFilm.length >= 8 &&
    (compactVideo === compactFilm || compactVideo.includes(compactFilm))
  ) {
    return { exact: true, similarity: 100, matchedField: "title" };
  }

  if (
    compactOriginal &&
    compactOriginal.length >= 8 &&
    (compactVideo === compactOriginal || compactVideo.includes(compactOriginal))
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

  if (candidateUsesEnglishReleaseTitle(film, candidate.title)) {
    confirmations.push("english_release_title");
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
  const language = evaluateYoutubeTrailerLanguage(candidate, { film });
  if (language.status === "non_english") {
    return {
      accepted: false,
      score: 0,
      language,
      channelAuthority,
      strongConfirmations: [],
      reasons: [`rejected: ${language.reason}`],
    };
  }
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
    // Short English release titles (e.g. Free Jimmy) often upload a few years
    // late without the year in the title. Allow a wider published window, or
    // animation context — still reject wrong-decade same-title hits.
    const publishedYear = candidate.publishedAt
      ? Number(String(candidate.publishedAt).slice(0, 4))
      : null;
    const withinEnglishReleaseWindow =
      Number.isFinite(publishedYear) &&
      Math.abs(publishedYear - Number(film.year)) <= 4;
    if (
      titleMatch.exact &&
      titleMatch.matchedField === "title" &&
      candidateUsesEnglishReleaseTitle(film, candidate.title) &&
      (withinEnglishReleaseWindow || ANIMATION_CONTEXT_PATTERN.test(text))
    ) {
      reasons.push(
        withinEnglishReleaseWindow
          ? "year relaxed: English release title within publish window"
          : "year relaxed: English release title with animation context"
      );
    } else {
      return {
        accepted: false,
        score,
        channelAuthority,
        strongConfirmations,
        reasons: [...reasons, "rejected: ambiguous title without year match"],
      };
    }
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
    language,
    channelAuthority,
    strongConfirmations,
    reasons,
  };
}

export function compareYoutubeTrailerCandidates(a, b, { preferOriginalWithEnglishSubs = false } = {}) {
  if (preferOriginalWithEnglishSubs) {
    const subsDifference =
      Number(Boolean(b.evaluation.language?.hasEnglishSubtitles)) -
      Number(Boolean(a.evaluation.language?.hasEnglishSubtitles));
    if (subsDifference !== 0) {
      return subsDifference;
    }

    // Prefer original/non-English audio over English dubs for this upgrade path.
    const originalAudioRank = (item) => {
      if (item.evaluation.language?.hasEnglishSubtitles && !item.evaluation.language?.hasEnglishAudio) {
        return 2;
      }
      if (item.evaluation.language?.hasEnglishSubtitles) {
        return 1;
      }
      return 0;
    };
    const originalDifference = originalAudioRank(b) - originalAudioRank(a);
    if (originalDifference !== 0) {
      return originalDifference;
    }
  } else {
    const languageRank = { english_accessible: 2, uncertain: 1, non_english: 0 };
    const languageDifference =
      (languageRank[b.evaluation.language?.status] ?? 1) -
      (languageRank[a.evaluation.language?.status] ?? 1);
    if (languageDifference !== 0) {
      return languageDifference;
    }
  }

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

export function rankYoutubeTrailerCandidates(
  film,
  candidates = [],
  { preferOriginalWithEnglishSubs = false } = {}
) {
  return candidates
    .filter((candidate) => candidate?.videoId)
    .map((candidate) => ({
      candidate,
      evaluation: scoreYoutubeTrailerCandidate(film, candidate),
    }))
    .sort((a, b) =>
      compareYoutubeTrailerCandidates(a, b, { preferOriginalWithEnglishSubs })
    );
}

function toSelectedYoutubeTrailer(best) {
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
    language_status: best.evaluation.language?.status ?? "uncertain",
    language_reason: best.evaluation.language?.reason ?? "language not declared",
    has_english_subtitles: Boolean(best.evaluation.language?.hasEnglishSubtitles),
    has_english_audio: Boolean(best.evaluation.language?.hasEnglishAudio),
    title: best.candidate.title ?? null,
    channelTitle: best.candidate.channelTitle ?? null,
  };
}

export function selectBestYoutubeTrailer(
  film,
  candidates = [],
  { preferOriginalWithEnglishSubs = false } = {}
) {
  const best = rankYoutubeTrailerCandidates(film, candidates, {
    preferOriginalWithEnglishSubs,
  }).find((item) => {
    if (!item.evaluation.accepted) return false;
    if (
      preferOriginalWithEnglishSubs &&
      !item.evaluation.language?.hasEnglishSubtitles
    ) {
      return false;
    }
    return true;
  });
  if (!best) {
    return null;
  }
  return toSelectedYoutubeTrailer(best);
}

export async function selectBestAvailableYoutubeTrailer(
  film,
  candidates = [],
  { isVideoAvailable, preferOriginalWithEnglishSubs = false } = {}
) {
  const ranked = rankYoutubeTrailerCandidates(film, candidates, {
    preferOriginalWithEnglishSubs,
  }).filter((item) => {
    if (!item.evaluation.accepted) return false;
    if (
      preferOriginalWithEnglishSubs &&
      !item.evaluation.language?.hasEnglishSubtitles
    ) {
      return false;
    }
    return true;
  });

  for (const best of ranked) {
    if (isVideoAvailable) {
      const available = await isVideoAvailable({
        key: best.candidate.videoId,
        site: "YouTube",
      });
      if (!available) continue;
    }
    return toSelectedYoutubeTrailer(best);
  }

  return null;
}

function mapSearchItem(item) {
  return {
    videoId: item?.id?.videoId ?? null,
    title: item?.snippet?.title ?? "",
    description: item?.snippet?.description ?? "",
    channelTitle: item?.snippet?.channelTitle ?? "",
    publishedAt: item?.snippet?.publishedAt ?? null,
    defaultAudioLanguage: item?.snippet?.defaultAudioLanguage ?? null,
  };
}

async function searchYoutubeWithQueries({
  apiKey,
  film,
  queries,
  fetchImpl = fetch,
  maxResultsPerQuery = 8,
  isVideoAvailable,
  checkAvailability = true,
  preferOriginalWithEnglishSubs = false,
  earlyStop = (selected) => selected?.language_status === "english_accessible",
} = {}) {
  if (!apiKey) {
    return null;
  }

  const byVideoId = new Map();
  const checker =
    isVideoAvailable ??
    (checkAvailability
      ? createYoutubeAvailabilityChecker({ apiKey, fetchImpl })
      : null);

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

    const selected = await selectBestAvailableYoutubeTrailer(
      film,
      [...byVideoId.values()],
      {
        isVideoAvailable: checker,
        preferOriginalWithEnglishSubs,
      }
    );
    if (selected && earlyStop(selected)) {
      return selected;
    }
  }

  return selectBestAvailableYoutubeTrailer(film, [...byVideoId.values()], {
    isVideoAvailable: checker,
    preferOriginalWithEnglishSubs,
  });
}

export async function searchYoutubeTrailers({
  apiKey,
  film,
  fetchImpl = fetch,
  maxResultsPerQuery = 8,
  isVideoAvailable,
  checkAvailability = true,
} = {}) {
  return searchYoutubeWithQueries({
    apiKey,
    film,
    queries: buildYoutubeTrailerQueries(film),
    fetchImpl,
    maxResultsPerQuery,
    isVideoAvailable,
    checkAvailability,
  });
}

/**
 * Find an accepted trailer that keeps original-language audio and adds English subs.
 * Returns null when no English-subtitle candidate is accepted.
 */
export async function searchYoutubeOriginalWithEnglishSubsTrailers({
  apiKey,
  film,
  originalLanguage = null,
  fetchImpl = fetch,
  maxResultsPerQuery = 8,
  isVideoAvailable,
  checkAvailability = true,
} = {}) {
  return searchYoutubeWithQueries({
    apiKey,
    film: {
      ...film,
      original_language:
        normalizeTrailerLanguageCode(originalLanguage) ??
        film.original_language ??
        null,
    },
    queries: buildYoutubeOriginalWithEnglishSubsQueries(film, originalLanguage),
    fetchImpl,
    maxResultsPerQuery,
    isVideoAvailable,
    checkAvailability,
    preferOriginalWithEnglishSubs: true,
    earlyStop: (selected) =>
      selected?.has_english_subtitles === true &&
      selected?.language_status === "english_accessible",
  });
}

/**
 * Inspect a known YouTube video for English audio/subtitle signals.
 */
export async function fetchYoutubeTrailerLanguageSignals(
  videoId,
  { apiKey, fetchImpl = fetch } = {}
) {
  if (!videoId || !apiKey) {
    return null;
  }

  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    id: videoId,
    key: apiKey,
  });
  const response = await fetchImpl(`${YOUTUBE_VIDEOS_ENDPOINT}?${params}`);
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const item = (data.items ?? []).find((row) => row.id === videoId);
  if (!item) {
    return null;
  }

  const title = item.snippet?.title ?? "";
  const description = item.snippet?.description ?? "";
  const text = `${title} ${description}`;
  const defaultAudioLanguage = item.snippet?.defaultAudioLanguage ?? null;
  const defaultLanguage = item.snippet?.defaultLanguage ?? null;
  const language = evaluateYoutubeTrailerLanguage({
    title,
    description,
    defaultAudioLanguage,
    defaultLanguage,
  });

  return {
    videoId,
    title,
    description,
    defaultAudioLanguage,
    defaultLanguage,
    hasCaptionsFlag: String(item.contentDetails?.caption ?? "") === "true",
    language,
    text,
  };
}
