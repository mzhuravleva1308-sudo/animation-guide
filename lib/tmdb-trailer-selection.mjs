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

export async function selectBestTrailerVideo(
  movie,
  { resolveChannel = async (video) => video.channel_name ?? null } = {}
) {
  const videos = (movie.videos?.results ?? []).filter(
    (video) => classifyTrailerVideo(video) !== null
  );

  for (const requiredPriority of [
    ["Trailer", true],
    ["Teaser", true],
    ["Clip", true],
  ]) {
    const selected = videos.find(
      (video) =>
        classifyTrailerVideo(video) === requiredPriority[0] &&
        video.official === requiredPriority[1]
    );
    if (selected) {
      return {
        video: selected,
        kind: requiredPriority[0],
        sourceReason: "TMDB marks video as official",
      };
    }
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
