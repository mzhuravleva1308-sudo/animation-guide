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
 * Prefer English videos before falling back to other/unknown languages.
 * Language is not a hard filter — non-English official trailers still qualify.
 * @param {object[]} videos
 */
export function orderPreferEnglish(videos) {
  if (!videos.length) return [];
  const english = videos.filter((video) => video.iso_639_1 === "en");
  const rest = videos.filter((video) => video.iso_639_1 !== "en");
  return [...english, ...rest];
}

export function preferEnglishVideo(videos) {
  return orderPreferEnglish(videos)[0] ?? null;
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
 * 2. Official TMDB Teaser
 * 3. Official Clip (when allowClip; beats fan/unofficial Trailers)
 * 4. Other TMDB Trailer (identity already confirmed by caller)
 * 5. Trusted-channel Clip (when allowClip)
 *
 * Never replaces a chosen TMDB Trailer with YouTube Search (caller concern).
 *
 * @param {object} movie
 * @param {{
 *   resolveChannel?: (video: object) => Promise<string | null>,
 *   allowClip?: boolean,
 *   isVideoAvailable?: (video: object) => Promise<boolean>,
 * }} [options]
 */
export async function selectBestTrailerVideo(
  movie,
  {
    resolveChannel = async (video) => video.channel_name ?? null,
    allowClip = true,
    isVideoAvailable = null,
  } = {}
) {
  const videos = (movie.videos?.results ?? []).filter(
    (video) => classifyTrailerVideo(video) !== null
  );
  const rejected = new Set();

  async function pickFrom(candidates, kind, sourceReason) {
    for (const video of orderPreferEnglish(candidates)) {
      if (!video?.key || rejected.has(video.key)) continue;
      if (isVideoAvailable) {
        const available = await isVideoAvailable(video);
        if (!available) {
          rejected.add(video.key);
          continue;
        }
      }
      return { video, kind, sourceReason };
    }
    return null;
  }

  async function pickOfficialTrailerOrTeaser(candidates) {
    const officialTrailer = await pickFrom(
      videosOfKind(candidates, "Trailer", { officialOnly: true }),
      "Trailer",
      "TMDB marks video as official"
    );
    if (officialTrailer) return officialTrailer;

    return pickFrom(
      videosOfKind(candidates, "Teaser", { officialOnly: true }),
      "Teaser",
      "TMDB marks video as official"
    );
  }

  async function pickUnofficialTrailer(candidates) {
    const unofficialTrailers = videosOfKind(candidates, "Trailer", {
      officialOnly: false,
    }).filter((video) => video.official !== true);
    return pickFrom(
      unofficialTrailers,
      "Trailer",
      "TMDB Trailer on identity-confirmed match"
    );
  }

  async function pickOfficialClip(candidates) {
    if (!allowClip) return null;
    return pickFrom(
      videosOfKind(candidates, "Clip", { officialOnly: true }),
      "Clip",
      "TMDB marks video as official"
    );
  }

  async function pickTrustedUnofficialClip(candidates) {
    if (!allowClip) return null;
    for (const video of orderPreferEnglish(candidates)) {
      if (classifyTrailerVideo(video) !== "Clip" || video.official === true) {
        continue;
      }
      if (!video?.key || rejected.has(video.key)) continue;
      if (isVideoAvailable) {
        const available = await isVideoAvailable(video);
        if (!available) {
          rejected.add(video.key);
          continue;
        }
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

  const englishVideos = videos.filter((video) => video.iso_639_1 === "en");
  const nonEnglishVideos = videos.filter((video) => video.iso_639_1 !== "en");

  for (const pool of [englishVideos, nonEnglishVideos, videos]) {
    const official = await pickOfficialTrailerOrTeaser(pool);
    if (official) return official;
  }

  for (const pool of [englishVideos, nonEnglishVideos, videos]) {
    const officialClip = await pickOfficialClip(pool);
    if (officialClip) return officialClip;
  }

  for (const pool of [englishVideos, nonEnglishVideos, videos]) {
    const unofficial = await pickUnofficialTrailer(pool);
    if (unofficial) return unofficial;
  }

  for (const pool of [englishVideos, nonEnglishVideos, videos]) {
    const trustedClip = await pickTrustedUnofficialClip(pool);
    if (trustedClip) return trustedClip;
  }

  return null;
}
