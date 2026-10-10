import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import {
  describeFilmScope,
  loadScopedFilms,
  parseFilmScopeArgs,
} from "./film-scope.mjs";
import {
  buildVideoLanguageList,
  evaluateTmdbMatch,
  fetchTmdbMovieDetails,
} from "../lib/tmdb-film-matching.mjs";
import { selectBestTrailerVideo } from "../lib/tmdb-trailer-selection.mjs";
import {
  TRAILER_SOURCE_MANUAL,
  buildAutoTrailerWritePayload,
  shouldAttemptTrailerLookup,
} from "../lib/trailer-fill-policy.mjs";
import {
  checkYoutubeVideosAvailability,
  createYoutubeAvailabilityChecker,
  parseYoutubeVideoId,
} from "../lib/youtube-trailer-availability.mjs";
import {
  buildTrailerSourceRecord,
  buildYoutubeWatchUrl,
  fetchYoutubeTrailerLanguageSignals,
  searchYoutubeOriginalWithEnglishSubsTrailers,
  searchYoutubeTrailers,
  trailerNeedsEnglishSubtitleUpgrade,
} from "../lib/youtube-trailer-search.mjs";

applyAppEnv();

const scope = parseFilmScopeArgs(process.argv.slice(2));
const force =
  scope.passthrough.includes("--force") || process.argv.includes("--force");
const replaceUnavailable =
  scope.passthrough.includes("--replace-unavailable") ||
  process.argv.includes("--replace-unavailable");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const tmdbApiKey = process.env.TMDB_API_KEY;
const youtubeApiKey = process.env.YOUTUBE_API_KEY;

if (!supabaseUrl || !supabaseKey || !tmdbApiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY or TMDB_API_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);
const isVideoAvailable = createYoutubeAvailabilityChecker({
  apiKey: youtubeApiKey,
});

async function searchTmdbMovie(film) {
  const queries = [film.title, film.original_title].filter(Boolean);
  const allResults = [];

  for (const query of queries) {
    const params = new URLSearchParams({
      api_key: tmdbApiKey,
      query,
      include_adult: "false",
    });

    if (film.year) {
      params.set("year", String(film.year));
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/search/movie?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`TMDB search error for "${query}": ${response.status}`);
    }

    const data = await response.json();
    allResults.push(...(data.results ?? []));
  }

  const uniqueResults = Array.from(
    new Map(allResults.map((result) => [result.id, result])).values()
  );

  const evaluatedResults = [];
  for (const result of uniqueResults.slice(0, 10)) {
    const details = await fetchTmdbMovieDetails(
      tmdbApiKey,
      result.id,
      "credits"
    );
    evaluatedResults.push({
      result: { ...result, ...details },
      evaluation: evaluateTmdbMatch(film, { ...result, ...details }),
    });
  }

  evaluatedResults.sort((a, b) => {
    const titleDifference =
      b.evaluation.evidence.titleSimilarity -
      a.evaluation.evidence.titleSimilarity;
    if (titleDifference !== 0) {
      return titleDifference;
    }

    const signalDifference =
      b.evaluation.evidence.signalCount -
      a.evaluation.evidence.signalCount;
    if (signalDifference !== 0) {
      return signalDifference;
    }

    return (
      (a.evaluation.evidence.yearDifference ?? Number.POSITIVE_INFINITY) -
      (b.evaluation.evidence.yearDifference ?? Number.POSITIVE_INFINITY)
    );
  });

  const bestMatch = evaluatedResults.find((item) => item.evaluation.accepted);

  if (!bestMatch) {
    console.log(
      `Skipped TMDB movie: ${film.title} (${film.year}) — no confident animation match`
    );

    for (const item of evaluatedResults.slice(0, 5)) {
      console.log(
        `  Candidate ${item.result.title} (${item.result.release_date?.slice(
          0,
          4
        ) ?? "unknown"}): ${item.evaluation.reason}`
      );
    }

    return null;
  }

  const videoLanguages = buildVideoLanguageList(
    bestMatch.result.original_language
  );
  console.log(
    `  Video languages for ${film.title}: ${videoLanguages.join(",")}`
  );

  const videoDetails = await fetchTmdbMovieDetails(
    tmdbApiKey,
    bestMatch.result.id,
    "videos",
    { includeVideoLanguage: videoLanguages.join(",") }
  );
  const matchedMovie = { ...bestMatch.result, ...videoDetails };

  console.log(
    `  Match ${bestMatch.result.title} (${bestMatch.result.release_date?.slice(
      0,
      4
    ) ?? "unknown"}): ${bestMatch.evaluation.reason}`
  );

  return matchedMovie;
}

async function resolveYoutubeChannel(video) {
  const response = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${video.key}`
    )}&format=json`
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.author_name ?? null;
}

async function getTmdbTrailerSelection(movie) {
  const selected = await selectBestTrailerVideo(movie, {
    resolveChannel: resolveYoutubeChannel,
    isVideoAvailable,
  });

  if (!selected?.video?.key) {
    return null;
  }

  console.log(
    `  Video ${selected.video.key}: ${selected.kind}; ${selected.sourceReason}${
      selected.video.channel_name ? `; channel: ${selected.video.channel_name}` : ""
    }`
  );

  return selected;
}

function trailerRecordFromSelection(selected) {
  return buildTrailerSourceRecord({
    provider: "youtube",
    videoId: selected.video.key,
    url: buildYoutubeWatchUrl(selected.video.key),
  });
}

async function getYoutubeFallbackTrailerSource(film) {
  if (!youtubeApiKey) {
    return null;
  }

  const selected = await searchYoutubeTrailers({
    apiKey: youtubeApiKey,
    film,
    isVideoAvailable,
  });

  if (!selected?.video_id || !selected?.url) {
    return null;
  }

  console.log(
    `  YouTube fallback ${selected.video_id}: score=${selected.score}; authority=${selected.channelAuthority?.tier ?? "other"}; ${selected.reasons.join("; ")}${
      selected.channelTitle ? `; channel: ${selected.channelTitle}` : ""
    }`
  );

  return buildTrailerSourceRecord({
    provider: selected.provider,
    videoId: selected.video_id,
    url: selected.url,
  });
}

async function maybeUpgradeNonEnglishTrailer({
  film,
  movie,
  selected,
}) {
  if (!selected?.video?.key || !youtubeApiKey) {
    return null;
  }

  const languageCode = selected.video.iso_639_1 ?? movie?.original_language ?? null;
  let text = String(selected.video.name ?? "");

  const signals = await fetchYoutubeTrailerLanguageSignals(selected.video.key, {
    apiKey: youtubeApiKey,
  });
  if (signals?.text) {
    text = `${text} ${signals.text}`.trim();
  }

  if (
    !trailerNeedsEnglishSubtitleUpgrade({
      languageCode,
      text,
    })
  ) {
    return null;
  }

  console.log(
    `  Non-English trailer without English subs (${languageCode ?? "unknown"}); searching YouTube for original + English subtitles`
  );

  const upgraded = await searchYoutubeOriginalWithEnglishSubsTrailers({
    apiKey: youtubeApiKey,
    film: {
      ...film,
      original_language: movie?.original_language ?? film.original_language ?? null,
    },
    originalLanguage: movie?.original_language ?? languageCode,
    isVideoAvailable,
  });

  if (!upgraded?.video_id || !upgraded?.url) {
    console.log(
      `  No original-language + English-subs YouTube trailer found; keeping TMDB selection`
    );
    return null;
  }

  console.log(
    `  YouTube original+EN-subs upgrade ${upgraded.video_id}: score=${upgraded.score}; ${upgraded.reasons.join("; ")}${
      upgraded.channelTitle ? `; channel: ${upgraded.channelTitle}` : ""
    }`
  );

  return buildTrailerSourceRecord({
    provider: upgraded.provider,
    videoId: upgraded.video_id,
    url: upgraded.url,
  });
}

async function resolveTrailerSource(film) {
  const movie = await searchTmdbMovie(film);

  if (movie?.id) {
    const selected = await getTmdbTrailerSelection(movie);
    if (selected?.video?.key) {
      const upgraded = await maybeUpgradeNonEnglishTrailer({
        film,
        movie,
        selected,
      });
      if (upgraded?.url) {
        return upgraded;
      }
      return trailerRecordFromSelection(selected);
    }
    console.log(`No confident TMDB trailer: ${film.title}`);
  } else {
    console.log(`No TMDB movie found: ${film.title}`);
  }

  // Vimeo / official site URLs are intentionally not automated.
  const youtubeTrailer = await getYoutubeFallbackTrailerSource(film);
  if (youtubeTrailer?.url) {
    return youtubeTrailer;
  }

  console.log(`No trailer found: ${film.title}`);
  return null;
}

async function loadFilmsForTrailerFill() {
  const baseSelect =
    "id,title,original_title,director,country,synopsis,year,trailer_url,trailer_provider,trailer_video_id";
  const applyFilters =
    force || replaceUnavailable
      ? undefined
      : (query) => query.is("trailer_url", null);

  try {
    return await loadScopedFilms(supabase, scope, {
      select: `${baseSelect},trailer_source`,
      applyFilters,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error?.message ?? error ?? "");
    if (!/trailer_source/i.test(message)) {
      throw error;
    }
    console.log(
      "Note: films.trailer_source missing; treating unmarked existing trailers as protected."
    );
    return loadScopedFilms(supabase, scope, {
      select: baseSelect,
      applyFilters,
    });
  }
}

async function existingYoutubeTrailerStillWorks(film, availabilityById) {
  const videoId =
    film.trailer_video_id || parseYoutubeVideoId(film.trailer_url);
  if (!videoId) {
    return true;
  }
  if (availabilityById?.has(videoId)) {
    return availabilityById.get(videoId).available;
  }
  return isVideoAvailable({ key: videoId, site: "YouTube" });
}

async function updateTrailerFields(filmId, payload) {
  const { error } = await supabase.from("films").update(payload).eq("id", filmId);
  if (!error) return null;

  const missingSourceColumn =
    /trailer_source/i.test(error.message ?? "") || error.code === "42703";
  if (!missingSourceColumn || !("trailer_source" in payload)) {
    return error;
  }

  const { trailer_source: _ignored, ...legacyPayload } = payload;
  const { error: legacyError } = await supabase
    .from("films")
    .update(legacyPayload)
    .eq("id", filmId);
  return legacyError;
}

async function main() {
  const films = await loadFilmsForTrailerFill();

  console.log(`Scope: ${describeFilmScope(scope)}`);
  console.log(
    `Films to fill: ${films.length} (force=${force}; replaceUnavailable=${replaceUnavailable})`
  );

  let availabilityById = new Map();
  if (replaceUnavailable && youtubeApiKey) {
    const videoIds = [
      ...new Set(
        films
          .map(
            (film) =>
              film.trailer_video_id || parseYoutubeVideoId(film.trailer_url)
          )
          .filter(Boolean)
      ),
    ];
    if (videoIds.length) {
      availabilityById = await checkYoutubeVideosAvailability(videoIds, {
        apiKey: youtubeApiKey,
      });
    }
  }

  for (const film of films) {
    const overwriteDead =
      Boolean(film.trailer_url) &&
      (force || replaceUnavailable) &&
      (shouldAttemptTrailerLookup(film, { force: true }) ||
        (replaceUnavailable && film.trailer_source !== TRAILER_SOURCE_MANUAL));

    if (film.trailer_url && replaceUnavailable && !force) {
      const stillWorks = await existingYoutubeTrailerStillWorks(
        film,
        availabilityById
      );
      if (stillWorks) {
        continue;
      }
      console.log(
        `Unavailable trailer: ${film.title} (${film.trailer_url})`
      );
      if (!overwriteDead) {
        console.log(
          `Skipped protected dead trailer: ${film.title} (source=${film.trailer_source ?? "unmarked"})`
        );
        continue;
      }
    } else if (!shouldAttemptTrailerLookup(film, { force })) {
      if (film.trailer_url) {
        console.log(
          `Skipped protected trailer: ${film.title} (source=${film.trailer_source ?? "unmarked"})`
        );
      }
      continue;
    }

    try {
      const trailer = await resolveTrailerSource(film);

      if (!trailer?.url) {
        if (film.trailer_url && overwriteDead) {
          const clearError = await updateTrailerFields(film.id, {
            trailer_url: null,
            trailer_provider: null,
            trailer_video_id: null,
            trailer_source: null,
          });
          if (clearError) {
            console.log(`Update error: ${film.title}: ${clearError.message}`);
          } else {
            console.log(`Cleared unavailable trailer: ${film.title}`);
          }
        }
        continue;
      }

      const payload = buildAutoTrailerWritePayload(trailer);
      const updateError = await updateTrailerFields(film.id, payload);

      if (updateError) {
        console.log(`Update error: ${film.title}: ${updateError.message}`);
        continue;
      }

      console.log(
        `Saved trailer: ${film.title} (${payload.trailer_provider}:${payload.trailer_video_id}; source=${payload.trailer_source})`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`Failed: ${film.title}: ${message}`);
    }
  }
}

main().catch((error) => {
  const message =
    error instanceof Error
      ? error.message
      : String(error?.message ?? error ?? "Unknown error");
  console.error(`fill-trailers failed: ${message}`);
  process.exitCode = 1;
});
