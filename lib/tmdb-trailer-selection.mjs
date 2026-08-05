export const VERIFIED_DISTRIBUTOR_CHANNELS = new Map([
  [
    "charades films",
    "verified distributor channel for Tangles",
  ],
]);

export const OFFICIAL_FESTIVAL_CHANNELS = [
  "annecy festival",
  "annecy international animation film festival",
  "cannes film festival",
  "festival de cannes",
  "sundance institute",
];

const EXCLUDED_NAME_PATTERNS = [
  /\binterview\b/i,
  /\breview\b/i,
  /\breaction\b/i,
  /\bfan\s*edit\b/i,
  /\bunrelated\b/i,
  /\bexcerpt\b/i,
];

export function normalizeChannelName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getChannelNames(movie) {
  return [
    ...(movie.production_companies ?? []).map((company) =>
      typeof company === "string" ? company : company.name
    ),
    ...(movie.distributors ?? []),
    ...(movie.distribution_companies ?? []),
    ...(movie.director_names ?? []),
    ...(movie.creators ?? []),
  ].filter(Boolean);
}

function channelMatchesName(channelName, name) {
  const channel = normalizeChannelName(channelName);
  const normalizedName = normalizeChannelName(name);

  return (
    Boolean(channel && normalizedName) &&
    (channel === normalizedName ||
      channel.includes(normalizedName) ||
      normalizedName.includes(channel))
  );
}

export function classifyTrailerVideo(video) {
  if (video.site !== "YouTube") {
    return null;
  }

  if (EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(video.name ?? ""))) {
    return null;
  }

  const nameLooksLikeClip = /\bclip\b/i.test(video.name ?? "");

  if (video.type === "Trailer" && !nameLooksLikeClip) {
    return "Trailer";
  }

  if (video.type === "Teaser" && !nameLooksLikeClip) {
    return "Teaser";
  }

  if (video.type === "Clip" || nameLooksLikeClip) {
    return "Clip";
  }

  // Featurette / Behind the Scenes / etc. are not accepted as trailers.
  return null;
}

export function getTrustedClipChannelReason(channelName, movie) {
  const normalizedChannel = normalizeChannelName(channelName);

  if (!normalizedChannel) {
    return null;
  }

  const verifiedDistributorReason =
    VERIFIED_DISTRIBUTOR_CHANNELS.get(normalizedChannel);
  if (verifiedDistributorReason) {
    return verifiedDistributorReason;
  }

  const relatedName = getChannelNames(movie).find((name) =>
    channelMatchesName(channelName, name)
  );
  if (relatedName) {
    return `channel matches film source "${relatedName}"`;
  }

  const festivalChannel = OFFICIAL_FESTIVAL_CHANNELS.find((name) =>
    channelMatchesName(channelName, name)
  );
  if (festivalChannel) {
    return `recognized official festival channel "${festivalChannel}"`;
  }

  return null;
}

/**
 * Among equal-priority TMDB videos, prefer English when available.
 * Language is not a hard filter — non-English official trailers still qualify.
 * @param {object[]} videos
 */
export function preferEnglishVideo(videos) {
  if (!videos.length) return null;
  return (
    videos.find((video) => video.iso_639_1 === "en") ?? videos[0] ?? null
  );
}

function videosOfKind(videos, kind, { officialOnly = false } = {}) {
  return videos.filter((video) => {
    if (classifyTrailerVideo(video) !== kind) return false;
    if (officialOnly) return video.official === true;
    return true;
  });
}

/**
 * Priority (aligned with discovery Media curator + fill-trailers):
 * 1. TMDB Trailer + official=true
 * 2. Other TMDB Trailer (identity already confirmed by caller)
 * 3. Official TMDB Teaser (only if no Trailer)
 * 4. Official Clip / trusted-channel Clip (optional; production default)
 *
 * Never replaces a chosen TMDB Trailer with YouTube Search (caller concern).
 *
 * @param {object} movie
 * @param {{
 *   resolveChannel?: (video: object) => Promise<string | null>,
 *   allowClip?: boolean,
 * }} [options]
 */
export async function selectBestTrailerVideo(
  movie,
  {
    resolveChannel = async (video) => video.channel_name ?? null,
    allowClip = true,
  } = {}
) {
  const videos = (movie.videos?.results ?? []).filter(
    (video) => classifyTrailerVideo(video) !== null
  );

  const officialTrailer = preferEnglishVideo(
    videosOfKind(videos, "Trailer", { officialOnly: true })
  );
  if (officialTrailer) {
    return {
      video: officialTrailer,
      kind: "Trailer",
      sourceReason: "TMDB marks video as official",
    };
  }

  const anyTrailer = preferEnglishVideo(
    videosOfKind(videos, "Trailer", { officialOnly: false })
  );
  if (anyTrailer) {
    return {
      video: anyTrailer,
      kind: "Trailer",
      sourceReason: "TMDB Trailer on identity-confirmed match",
    };
  }

  const officialTeaser = preferEnglishVideo(
    videosOfKind(videos, "Teaser", { officialOnly: true })
  );
  if (officialTeaser) {
    return {
      video: officialTeaser,
      kind: "Teaser",
      sourceReason: "TMDB marks video as official",
    };
  }

  if (!allowClip) {
    return null;
  }

  const officialClip = preferEnglishVideo(
    videosOfKind(videos, "Clip", { officialOnly: true })
  );
  if (officialClip) {
    return {
      video: officialClip,
      kind: "Clip",
      sourceReason: "TMDB marks video as official",
    };
  }

  for (const video of videos) {
    if (classifyTrailerVideo(video) !== "Clip" || video.official === true) {
      continue;
    }

    const channel = await resolveChannel(video);
    const sourceReason = getTrustedClipChannelReason(channel, movie);
    if (sourceReason) {
      return {
        video: { ...video, channel_name: channel },
        kind: "Clip",
        sourceReason,
      };
    }
  }

  return null;
}
