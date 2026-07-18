export const TMDB_ANIMATION_GENRE_ID = 16;

const COMMON_TITLE_MAX_LENGTH = 10;

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

function tokenize(value) {
  return new Set(normalizeText(value).split(" ").filter((word) => word.length > 2));
}

function getTokenOverlap(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }

  return (
    [...tokensA].filter((token) => tokensB.has(token)).length /
    Math.min(tokensA.size, tokensB.size)
  );
}

export function getTitleSimilarity(a, b) {
  const normalizedA = normalizeText(a);
  const normalizedB = normalizeText(b);

  if (!normalizedA || !normalizedB) {
    return 0;
  }

  if (normalizedA === normalizedB) {
    return 100;
  }

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return 70;
  }

  const sharedTokens = [...tokenize(normalizedA)].filter((token) =>
    tokenize(normalizedB).has(token)
  );

  return (
    (sharedTokens.length /
      Math.max(tokenize(normalizedA).size, tokenize(normalizedB).size)) *
    60
  );
}

function getYearFromDate(date) {
  if (!date) {
    return null;
  }

  return Number(String(date).slice(0, 4));
}

export function getYearDifference(film, result) {
  const filmYear = Number(film.year);
  const resultYear = getYearFromDate(result.release_date);

  if (!Number.isFinite(filmYear) || !resultYear) {
    return null;
  }

  return Math.abs(filmYear - resultYear);
}

export function buildVideoLanguageList(originalLanguage) {
  const normalizedOriginalLanguage =
    typeof originalLanguage === "string"
      ? originalLanguage.trim().toLowerCase().split("-")[0]
      : "";
  const languages = ["en"];

  if (/^[a-z]{2}$/.test(normalizedOriginalLanguage)) {
    languages.push(normalizedOriginalLanguage);
  }

  languages.push("null");
  return [...new Set(languages)];
}

function isAnimationResult(result) {
  return (
    result.genre_ids?.includes(TMDB_ANIMATION_GENRE_ID) ||
    result.genres?.some((genre) => genre.id === TMDB_ANIMATION_GENRE_ID)
  );
}

function getDirectorNames(result) {
  if (Array.isArray(result.director_names)) {
    return result.director_names;
  }

  if (Array.isArray(result.directors)) {
    return result.directors;
  }

  return [];
}

function getCountryNames(result) {
  if (Array.isArray(result.production_countries)) {
    return result.production_countries.map((country) =>
      typeof country === "string" ? country : country.name
    );
  }

  return [];
}

function directorsMatch(filmDirector, resultDirectors) {
  const filmDirectors = String(filmDirector ?? "")
    .split(",")
    .map((director) => director.trim())
    .filter(Boolean);

  return filmDirectors.some((filmName) =>
    resultDirectors.some((resultName) => {
      const filmTokens = tokenize(filmName);
      const resultTokens = tokenize(resultName);

      return (
        normalizeText(filmName) === normalizeText(resultName) ||
        (filmTokens.size >= 2 &&
          filmTokens.size === resultTokens.size &&
          [...filmTokens].every((token) => resultTokens.has(token)))
      );
    })
  );
}

function countriesMatch(filmCountry, resultCountries) {
  const aliases = new Map([
    ["usa", "united states"],
    ["us", "united states"],
    ["united states of america", "united states"],
  ]);
  const normalizeCountry = (country) => {
    const normalized = normalizeText(country);
    return aliases.get(normalized) ?? normalized;
  };
  const filmCountries = String(filmCountry ?? "")
    .split(",")
    .map(normalizeCountry)
    .filter(Boolean);

  return filmCountries.some((filmName) =>
    resultCountries.some((resultName) => normalizeCountry(resultName) === filmName)
  );
}

export function getStrongMatchSignals(film, result) {
  const titleSimilarity = Math.max(
    getTitleSimilarity(film.title, result.title),
    getTitleSimilarity(film.title, result.original_title),
    getTitleSimilarity(film.original_title, result.title),
    getTitleSimilarity(film.original_title, result.original_title)
  );
  const titleMatch = titleSimilarity >= 80;
  const normalizedFilmTitle = normalizeText(film.title);
  const normalizedFilmOriginalTitle = normalizeText(film.original_title);
  const normalizedResultTitle = normalizeText(result.title);
  const normalizedResultOriginalTitle = normalizeText(result.original_title);
  const originalTitleMatch =
    Boolean(film.original_title && result.original_title) &&
    normalizedFilmOriginalTitle === normalizedResultOriginalTitle &&
    (normalizedFilmOriginalTitle !== normalizedFilmTitle ||
      normalizedResultOriginalTitle !== normalizedResultTitle);
  const overviewSimilarity = getTokenOverlap(film.synopsis, result.overview);
  const directorMatch = directorsMatch(film.director, getDirectorNames(result));
  const countryMatch = countriesMatch(film.country, getCountryNames(result));
  const animationMatch = isAnimationResult(result);

  const signals = {
    director: directorMatch,
    original_title: originalTitleMatch,
    synopsis: overviewSimilarity >= 0.15,
    country: countryMatch,
    animation: animationMatch,
  };

  return {
    titleMatch,
    titleSimilarity,
    yearDifference: getYearDifference(film, result),
    signals,
    signalCount: Object.values(signals).filter(Boolean).length,
    overviewSimilarity,
    commonTitle:
      normalizeText(film.title).length <= COMMON_TITLE_MAX_LENGTH ||
      normalizeText(film.title).split(" ").length === 1,
  };
}

export function evaluateTmdbMatch(film, result) {
  const evidence = getStrongMatchSignals(film, result);
  const reasons = [];

  if (!evidence.titleMatch) {
    return {
      accepted: false,
      evidence,
      reason: "rejected: title is not a sufficiently strong match",
    };
  }

  if (evidence.yearDifference !== null && evidence.yearDifference > 2) {
    return {
      accepted: false,
      evidence,
      reason: `rejected: year difference ${evidence.yearDifference} is greater than 2`,
    };
  }

  if (evidence.yearDifference === 2 && evidence.signalCount < 2) {
    return {
      accepted: false,
      evidence,
      reason: `rejected: two-year difference requires at least two strong signals, got ${evidence.signalCount}`,
    };
  }

  if (evidence.yearDifference === null && evidence.signalCount < 2) {
    return {
      accepted: false,
      evidence,
      reason: `rejected: unknown year requires at least two strong signals, got ${evidence.signalCount}`,
    };
  }

  if (evidence.yearDifference !== 2 && evidence.signalCount === 0) {
    return {
      accepted: false,
      evidence,
      reason: "rejected: title-only match is not allowed",
    };
  }

  if (
    evidence.commonTitle &&
    !evidence.signals.director &&
    evidence.signalCount < 2
  ) {
    return {
      accepted: false,
      evidence,
      reason:
        "rejected: common title requires a director match or at least two strong signals",
    };
  }

  if (evidence.yearDifference === 0) {
    reasons.push("year difference 0");
  } else if (evidence.yearDifference === 1) {
    reasons.push("year difference 1 is compatible");
  } else if (evidence.yearDifference === 2) {
    reasons.push("year difference 2 allowed by two strong signals");
  } else {
    reasons.push("year unavailable");
  }

  const matchingSignals = Object.entries(evidence.signals)
    .filter(([, matched]) => matched)
    .map(([name]) => name);
  reasons.push(`strong signals: ${matchingSignals.join(", ")}`);

  return {
    accepted: true,
    evidence,
    reason: `accepted: ${reasons.join("; ")}`,
  };
}

export async function fetchTmdbMovieDetails(
  apiKey,
  movieId,
  appendToResponse = "credits",
  { includeVideoLanguage = null } = {}
) {
  const params = new URLSearchParams({
    api_key: apiKey,
    append_to_response: appendToResponse,
  });

  if (includeVideoLanguage) {
    params.set("include_video_language", includeVideoLanguage);
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/movie/${movieId}?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`TMDB details failed for ${movieId}: ${response.status}`);
  }

  const data = await response.json();
  return {
    ...data,
    director_names: (data.credits?.crew ?? [])
      .filter((member) => member.job === "Director")
      .map((member) => member.name),
  };
}
