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
  buildAutoTrailerWritePayload,
  shouldAttemptTrailerLookup,
} from "../lib/trailer-fill-policy.mjs";
import {
  buildTrailerSourceRecord,
  buildYoutubeWatchUrl,
  searchYoutubeTrailers,
} from "../lib/youtube-trailer-search.mjs";

applyAppEnv();

const scope = parseFilmScopeArgs(process.argv.slice(2));
const force =
  scope.passthrough.includes("--force") || process.argv.includes("--force");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const tmdbApiKey = process.env.TMDB_API_KEY;
const youtubeApiKey = process.env.YOUTUBE_API_KEY;

if (!supabaseUrl || !supabaseKey || !tmdbApiKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY or TMDB_API_KEY"
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

async function getTmdbTrailerSource(movie) {
  const selected = await selectBestTrailerVideo(movie, {
    resolveChannel: resolveYoutubeChannel,
  });

  if (!selected?.video?.key) {
    return null;
  }

  console.log(
    `  Video ${selected.video.key}: ${selected.kind}; ${selected.sourceReason}${
      selected.video.channel_name ? `; channel: ${selected.video.channel_name}` : ""
    }`
  );

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

async function resolveTrailerSource(film) {
  const movie = await searchTmdbMovie(film);

  if (movie?.id) {
    const tmdbTrailer = await getTmdbTrailerSource(movie);
    if (tmdbTrailer?.url) {
      return tmdbTrailer;
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

  try {
    return await loadScopedFilms(supabase, scope, {
      select: `${baseSelect},trailer_source`,
      applyFilters: force
        ? undefined
        : (query) => query.is("trailer_url", null),
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
      applyFilters: force
        ? undefined
        : (query) => query.is("trailer_url", null),
    });
  }
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

  const eligible = films.filter((film) =>
    shouldAttemptTrailerLookup(film, { force })
  );
  const skippedProtected = films.length - eligible.length;

  console.log(`Scope: ${describeFilmScope(scope)}`);
  console.log(
    `Films to fill: ${eligible.length} (force=${force}; protected/skipped=${skippedProtected})`
  );

  for (const film of films) {
    if (!shouldAttemptTrailerLookup(film, { force })) {
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
