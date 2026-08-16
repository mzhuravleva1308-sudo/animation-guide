/**
 * Media curator for weekly film discovery staging.
 *
 * Finds poster (TMDB poster_path → external w500 URL) and trailer (TMDB YouTube
 * then YouTube Search) for Eligibility PASS candidates.
 *
 * Writes ONLY to film_discovery_candidates fields — never films, Storage,
 * synopsis/mood/techniques/festivals, or catalog_visible.
 */

import {
  DISCOVERY_ELIGIBILITY,
  DISCOVERY_MEDIA_MAX_ATTEMPTS,
  DISCOVERY_MEDIA_STATUS,
  TMDB_POSTER_BASE_URL,
} from "./film-discovery.mjs";
import {
  buildVideoLanguageList,
  evaluateTmdbMatch,
  fetchTmdbMovieDetails,
} from "./tmdb-film-matching.mjs";
import { selectBestTrailerVideo } from "./tmdb-trailer-selection.mjs";
import {
  buildAutoTrailerWritePayload,
} from "./trailer-fill-policy.mjs";
import {
  buildTrailerSourceRecord,
  buildYoutubeWatchUrl,
  searchYoutubeTrailers,
} from "./youtube-trailer-search.mjs";

export const MEDIA_CURATOR_ROLE = "Media curator";

/**
 * @param {object} candidate — discovery candidate row / researcher shape
 */
export function candidateToFilmIdentity(candidate) {
  const directors = Array.isArray(candidate.directors)
    ? candidate.directors
    : [];
  return {
    title: candidate.title,
    original_title: candidate.original_title ?? null,
    year: candidate.year ?? null,
    director: directors.join(", ") || null,
    directors,
    country: Array.isArray(candidate.countries)
      ? candidate.countries.join(", ")
      : null,
  };
}

/**
 * Media curator runs only after Eligibility PASS.
 * @param {{ eligibility_result?: string | null, result?: string | null }} reviewOrRow
 */
export function shouldRunMediaCurator(reviewOrRow) {
  const result =
    reviewOrRow?.eligibility_result ?? reviewOrRow?.result ?? null;
  return result === DISCOVERY_ELIGIBILITY.pass;
}

/**
 * Skip already-complete media unless force.
 * @param {{ media_status?: string | null }} row
 * @param {{ force?: boolean }} [options]
 */
export function shouldAttemptMediaLookup(row, { force = false } = {}) {
  if (force) return true;
  return row?.media_status !== DISCOVERY_MEDIA_STATUS.complete;
}

/**
 * Resume targets: pending / partial / failed (not complete, not needs_review unless force).
 * @param {{ media_status?: string | null }} row
 * @param {{ force?: boolean }} [options]
 */
export function isMediaResumeEligible(row, { force = false } = {}) {
  if (force) return true;
  const status = row?.media_status ?? DISCOVERY_MEDIA_STATUS.pending;
  return [
    DISCOVERY_MEDIA_STATUS.pending,
    DISCOVERY_MEDIA_STATUS.partial,
    DISCOVERY_MEDIA_STATUS.failed,
  ].includes(status);
}

/**
 * @param {{ hasPoster: boolean, hasTrailer: boolean, needsReview?: boolean, notes?: string[] }} input
 */
export function resolveMediaStatus(input) {
  if (input.needsReview) {
    return DISCOVERY_MEDIA_STATUS.needsReview;
  }
  if (input.hasPoster && input.hasTrailer) {
    return DISCOVERY_MEDIA_STATUS.complete;
  }
  if (input.hasPoster || input.hasTrailer) {
    return DISCOVERY_MEDIA_STATUS.partial;
  }
  return DISCOVERY_MEDIA_STATUS.failed;
}

/**
 * Build DB patch — never includes identity fields.
 * @param {object} mediaResult
 * @param {{ previousAttempts?: number }} [options]
 */
export function buildMediaCandidatePatch(mediaResult, options = {}) {
  const previousAttempts = options.previousAttempts ?? 0;
  return {
    poster_url: mediaResult.poster_url ?? null,
    poster_source_url: mediaResult.poster_source_url ?? null,
    poster_source_label: mediaResult.poster_source_label ?? null,
    trailer_url: mediaResult.trailer_url ?? null,
    trailer_provider: mediaResult.trailer_provider ?? null,
    trailer_video_id: mediaResult.trailer_video_id ?? null,
    trailer_source: mediaResult.trailer_source ?? null,
    trailer_source_label: mediaResult.trailer_source_label ?? null,
    media_status: mediaResult.media_status,
    media_notes: mediaResult.media_notes ?? null,
    media_attempts: previousAttempts + 1,
    media_updated_at: new Date().toISOString(),
    // Explicit non-actions for callers/tests
    writes_to_films_table: false,
    publish: false,
    enrich_full: false,
    review_status_unchanged: true,
    identity_fields_unchanged: true,
  };
}

/**
 * Discovery Media curator: Trailer/official Trailer/Teaser only.
 * Clips are left to YouTube fallback (or media_partial) — not accepted from TMDB.
 */
export async function selectDiscoveryTrailer(movie, resolveChannel) {
  return selectBestTrailerVideo(movie, {
    resolveChannel:
      resolveChannel ?? (async (video) => video.channel_name ?? null),
    allowClip: false,
  });
}

export function isYoutubeSearchQuotaError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /\(429\)/.test(message) || /quota/i.test(message);
}

export function youtubeQuotaMediaNote(message) {
  return (
    `Trailer search blocked by quota/rate limit and should be retried later. ` +
    `Poster kept; trailer not proven absent. (${message})`
  );
}

/**
 * Reject TMDB backdrop-only results — posters must use poster_path (vertical).
 * @param {{ poster_path?: string | null, backdrop_path?: string | null }} movie
 */
export function buildPosterFromTmdbMovie(movie) {
  if (!movie?.poster_path) {
    return null;
  }
  // Never treat backdrop as poster
  const url = `${TMDB_POSTER_BASE_URL}${movie.poster_path}`;
  return {
    poster_url: url,
    poster_source_url: url,
    poster_source_label: "TMDB poster_path (theatrical)",
    uses_backdrop: false,
  };
}

/**
 * @param {object} filmIdentity
 * @param {{
 *   tmdbApiKey: string,
 *   fetchImpl?: typeof fetch,
 *   fetchDetails?: typeof fetchTmdbMovieDetails,
 * }} options
 */
export async function findTmdbMatchForCandidate(filmIdentity, options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const fetchDetails = options.fetchDetails ?? fetchTmdbMovieDetails;
  const queries = [filmIdentity.title, filmIdentity.original_title].filter(
    Boolean
  );
  const allResults = [];

  for (const query of queries) {
    const params = new URLSearchParams({
      api_key: options.tmdbApiKey,
      query,
      include_adult: "false",
    });
    if (filmIdentity.year) {
      params.set("year", String(filmIdentity.year));
    }
    const response = await fetchImpl(
      `https://api.themoviedb.org/3/search/movie?${params.toString()}`
    );
    if (!response.ok) {
      throw new Error(`TMDB search failed: ${response.status}`);
    }
    const data = await response.json();
    allResults.push(...(data.results ?? []));
  }

  const uniqueResults = Array.from(
    new Map(allResults.map((result) => [result.id, result])).values()
  );

  const evaluated = [];
  for (const result of uniqueResults.slice(0, 10)) {
    const details = await fetchDetails(
      options.tmdbApiKey,
      result.id,
      "credits,videos",
      {
        includeVideoLanguage: buildVideoLanguageList(
          result.original_language
        ).join(","),
      }
    );
    const merged = { ...result, ...details };
    evaluated.push({
      result: merged,
      evaluation: evaluateTmdbMatch(filmIdentity, merged),
    });
  }

  evaluated.sort((a, b) => {
    const titleDifference =
      b.evaluation.evidence.titleSimilarity -
      a.evaluation.evidence.titleSimilarity;
    if (titleDifference !== 0) return titleDifference;
    return (
      b.evaluation.evidence.signalCount - a.evaluation.evidence.signalCount
    );
  });

  const accepted = evaluated.find((item) => item.evaluation.accepted);
  return {
    match: accepted?.result ?? null,
    evaluation: accepted?.evaluation ?? evaluated[0]?.evaluation ?? null,
    candidatesTried: evaluated.length,
  };
}

/**
 * Pure orchestration with injectable finders (tests) or real adapters.
 *
 * @param {object} candidate
 * @param {{
 *   eligibilityResult?: string,
 *   previousAttempts?: number,
 *   maxAttempts?: number,
 *   findPoster?: (identity: object, attempt: number) => Promise<object | null>,
 *   findTrailer?: (identity: object, attempt: number, tmdbMovie?: object | null) => Promise<object | null>,
 *   resolveTmdb?: (identity: object) => Promise<{ match: object | null, evaluation: object | null }>,
 * }} [options]
 */
export async function runMediaCuratorForCandidate(candidate, options = {}) {
  if (
    options.eligibilityResult != null &&
    !shouldRunMediaCurator({ result: options.eligibilityResult })
  ) {
    return {
      skipped: true,
      reason: "eligibility_not_pass",
      media_status: candidate.media_status ?? DISCOVERY_MEDIA_STATUS.pending,
      writes_to_films_table: false,
      identity_snapshot: {
        title: candidate.title,
        original_title: candidate.original_title,
        year: candidate.year,
        directors: candidate.directors,
        countries: candidate.countries,
        runtime_minutes: candidate.runtime_minutes,
      },
    };
  }

  const previousAttempts = options.previousAttempts ?? candidate.media_attempts ?? 0;
  const maxAttempts = options.maxAttempts ?? DISCOVERY_MEDIA_MAX_ATTEMPTS;
  if (previousAttempts >= maxAttempts) {
    return {
      skipped: true,
      reason: "max_attempts_reached",
      media_status: candidate.media_status ?? DISCOVERY_MEDIA_STATUS.failed,
      writes_to_films_table: false,
    };
  }

  const identityBefore = {
    title: candidate.title,
    original_title: candidate.original_title ?? null,
    year: candidate.year,
    directors: [...(candidate.directors ?? [])],
    countries: [...(candidate.countries ?? [])],
    runtime_minutes: candidate.runtime_minutes ?? null,
  };

  const filmIdentity = candidateToFilmIdentity(candidate);
  const notes = [];
  let needsReview = false;
  let tmdbMovie = null;

  if (options.resolveTmdb) {
    const resolved = await options.resolveTmdb(filmIdentity);
    tmdbMovie = resolved.match;
    if (!resolved.match) {
      notes.push(
        resolved.evaluation?.reason ??
          "No accepted TMDB identity match; media may be unreliable"
      );
      needsReview = true;
    }
  }

  const attempt = previousAttempts + 1;
  let poster = null;
  let trailer = null;

  if (options.findPoster) {
    poster = await options.findPoster(filmIdentity, attempt);
  } else if (tmdbMovie) {
    poster = buildPosterFromTmdbMovie(tmdbMovie);
    if (!poster) {
      notes.push("TMDB match has no poster_path");
    }
  }

  if (options.findTrailer) {
    trailer = await options.findTrailer(filmIdentity, attempt, tmdbMovie);
  }

  // Guard: do not accept backdrop-as-poster
  if (poster?.uses_backdrop) {
    notes.push("Rejected horizontal backdrop as poster");
    poster = null;
  }

  if (poster?.wrong_film) {
    notes.push(poster.note ?? "Poster belongs to a different film");
    needsReview = true;
    poster = null;
  }

  if (trailer?.wrong_film) {
    notes.push(trailer.note ?? "Trailer belongs to a different film");
    needsReview = true;
    trailer = null;
  }

  if (trailer?.is_fan_upload && !trailer?.accepted_official) {
    notes.push("Rejected non-official / fan upload trailer");
    trailer = null;
  }

  const hasPoster = Boolean(poster?.poster_url);
  const hasTrailer = Boolean(trailer?.url || trailer?.trailer_url);
  let finalStatus = resolveMediaStatus({
    hasPoster,
    hasTrailer,
    needsReview: false,
  });
  if (needsReview) {
    finalStatus = DISCOVERY_MEDIA_STATUS.needsReview;
    if (hasPoster || hasTrailer) {
      notes.push("Media found but identity/provenance needs manual review");
    }
  }

  const trailerPayload = trailer
    ? buildAutoTrailerWritePayload({
        url: trailer.url ?? trailer.trailer_url,
        provider: trailer.provider ?? trailer.trailer_provider ?? "youtube",
        video_id: trailer.video_id ?? trailer.trailer_video_id ?? null,
      })
    : {
        trailer_url: null,
        trailer_provider: null,
        trailer_video_id: null,
        trailer_source: null,
      };

  const result = {
    poster_url: poster?.poster_url ?? null,
    poster_source_url: poster?.poster_source_url ?? poster?.poster_url ?? null,
    poster_source_label: poster?.poster_source_label ?? null,
    ...trailerPayload,
    trailer_source_label: trailer?.source_label ?? trailer?.trailer_source_label ?? null,
    media_status: finalStatus,
    media_notes: notes.length > 0 ? notes.join("; ") : null,
    skipped: false,
  };

  const patch = buildMediaCandidatePatch(result, { previousAttempts });

  // Identity must remain unchanged
  const identityAfter = {
    title: candidate.title,
    original_title: candidate.original_title ?? null,
    year: candidate.year,
    directors: [...(candidate.directors ?? [])],
    countries: [...(candidate.countries ?? [])],
    runtime_minutes: candidate.runtime_minutes ?? null,
  };

  return {
    ...patch,
    identity_before: identityBefore,
    identity_after: identityAfter,
    identity_unchanged:
      JSON.stringify(identityBefore) === JSON.stringify(identityAfter),
  };
}

/**
 * Real adapters using project TMDB + YouTube pipelines.
 * @param {object} candidate
 * @param {{
 *   tmdbApiKey: string,
 *   youtubeApiKey?: string,
 *   previousAttempts?: number,
 *   fetchImpl?: typeof fetch,
 *   youtubeSearchGate?: { skip: boolean, reason?: string | null, attempts?: number, quotaErrors?: number },
 * }} options
 */
export async function curateDiscoveryMedia(candidate, options) {
  if (
    candidate.eligibility_result != null &&
    candidate.eligibility_result !== DISCOVERY_ELIGIBILITY.pass
  ) {
    return {
      skipped: true,
      reason: "eligibility_not_pass",
      media_status: candidate.media_status ?? DISCOVERY_MEDIA_STATUS.pending,
      writes_to_films_table: false,
      publish: false,
      enrich_full: false,
      review_status_unchanged: true,
      identity_fields_unchanged: true,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const identity = candidateToFilmIdentity(candidate);
  const previousAttempts =
    options.previousAttempts ?? candidate.media_attempts ?? 0;
  const attempt = previousAttempts + 1;
  const notes = [];
  let needsReview = false;
  /** @type {"tmdb" | "youtube" | null} */
  let trailerOrigin = null;
  let youtubeSearchAttempted = false;
  let youtubeQuotaHit = false;

  const resolved = await findTmdbMatchForCandidate(identity, {
    tmdbApiKey: options.tmdbApiKey,
    fetchImpl,
  });

  if (!resolved.match) {
    notes.push(
      resolved.evaluation?.reason ?? "No accepted TMDB identity match"
    );
    needsReview = true;
  }

  const poster = resolved.match
    ? buildPosterFromTmdbMovie(resolved.match)
    : null;
  if (!poster) {
    notes.push("No theatrical poster_path on TMDB match");
  }

  let trailer = null;
  if (resolved.match) {
    // Channel resolve uses YouTube oEmbed (not Search API) — no search quota.
    const selected = await selectDiscoveryTrailer(
      resolved.match,
      async (video) => {
        try {
          const oembed = await fetchImpl(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(
              buildYoutubeWatchUrl(video.key)
            )}&format=json`
          );
          if (!oembed.ok) return null;
          const data = await oembed.json();
          return data.author_name ?? null;
        } catch {
          return null;
        }
      }
    );
    if (selected?.video) {
      trailer = {
        url: buildYoutubeWatchUrl(selected.video.key),
        provider: "youtube",
        video_id: selected.video.key,
        source_label: `TMDB ${selected.kind ?? "Trailer"} (${selected.sourceReason})`,
      };
      trailerOrigin = "tmdb";
    } else {
      notes.push("No suitable TMDB Trailer/Teaser on matched movie");
    }
  }

  const youtubeGate = options.youtubeSearchGate;
  const youtubeBlocked = Boolean(youtubeGate?.skip);

  // Never replace a TMDB trailer with YouTube Search.
  if (!trailer && options.youtubeApiKey && !youtubeBlocked) {
    const filmForSearch =
      attempt > 1
        ? { ...identity, title: `${identity.title} official trailer` }
        : identity;
    youtubeSearchAttempted = true;
    if (youtubeGate) {
      youtubeGate.attempts = (youtubeGate.attempts ?? 0) + 1;
    }
    try {
      const yt = await searchYoutubeTrailers({
        apiKey: options.youtubeApiKey,
        film: filmForSearch,
        fetchImpl,
      });
      if (yt) {
        trailer = {
          ...buildTrailerSourceRecord(yt),
          source_label: yt.channelTitle
            ? `YouTube search (${yt.channelTitle})`
            : "YouTube search",
        };
        trailerOrigin = "youtube";
      } else {
        notes.push("YouTube Search found no accepted official trailer");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isYoutubeSearchQuotaError(error)) {
        youtubeQuotaHit = true;
        if (youtubeGate) {
          youtubeGate.skip = true;
          youtubeGate.reason = message;
          youtubeGate.quotaErrors = (youtubeGate.quotaErrors ?? 0) + 1;
        }
        notes.push(youtubeQuotaMediaNote(message));
      } else {
        notes.push(`YouTube search unavailable: ${message}`);
      }
    }
  } else if (!trailer && youtubeBlocked) {
    notes.push(
      youtubeQuotaMediaNote(
        youtubeGate?.reason ?? "YouTube Search skipped after prior 429 in this run"
      )
    );
  }

  if (
    !trailer &&
    !notes.some(
      (note) =>
        note.includes("blocked by quota/rate limit") ||
        note.includes("YouTube search unavailable") ||
        note.includes("YouTube Search found no") ||
        note.includes("No suitable TMDB")
    )
  ) {
    notes.push("No accepted trailer found");
  }

  const hasPoster = Boolean(poster?.poster_url);
  const hasTrailer = Boolean(trailer?.url);
  let media_status = resolveMediaStatus({
    hasPoster,
    hasTrailer,
    needsReview: false,
  });
  if (needsReview) {
    media_status = DISCOVERY_MEDIA_STATUS.needsReview;
  }

  const trailerPayload = trailer
    ? buildAutoTrailerWritePayload({
        url: trailer.url,
        provider: trailer.provider ?? "youtube",
        video_id: trailer.video_id ?? null,
      })
    : {
        trailer_url: null,
        trailer_provider: null,
        trailer_video_id: null,
        trailer_source: null,
      };

  const patch = buildMediaCandidatePatch(
    {
      poster_url: poster?.poster_url ?? null,
      poster_source_url: poster?.poster_source_url ?? null,
      poster_source_label: poster?.poster_source_label ?? null,
      ...trailerPayload,
      trailer_source_label: trailer?.source_label ?? null,
      media_status,
      media_notes: notes.length ? notes.join("; ") : null,
    },
    { previousAttempts }
  );

  return {
    ...patch,
    trailer_origin: trailerOrigin,
    youtube_search_attempted: youtubeSearchAttempted,
    youtube_quota_hit: youtubeQuotaHit,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Batch media curation with dry-run support.
 * @param {object[]} candidates
 * @param {{
 *   dryRun?: boolean,
 *   force?: boolean,
 *   delayMs?: number,
 *   curateFn?: typeof curateDiscoveryMedia,
 *   updateFn?: (id: string, patch: object) => Promise<void>,
 *   tmdbApiKey?: string,
 *   youtubeApiKey?: string,
 * }} options
 */
export async function runDiscoveryMediaBatch(candidates, options = {}) {
  const curateFn = options.curateFn ?? curateDiscoveryMedia;
  const delayMs = options.delayMs ?? 250;
  const youtubeSearchGate = {
    skip: false,
    reason: null,
    attempts: 0,
    quotaErrors: 0,
  };
  /** @type {object[]} */
  const results = [];
  let wouldUpdate = 0;
  let skippedComplete = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!isMediaResumeEligible(candidate, { force: options.force })) {
      skippedComplete += 1;
      results.push({
        id: candidate.id,
        title: candidate.title,
        skipped: true,
        reason: "media_complete_without_force",
        media_status: candidate.media_status,
      });
      continue;
    }

    let media;
    try {
      media = await curateFn(candidate, {
        tmdbApiKey: options.tmdbApiKey,
        youtubeApiKey: options.youtubeApiKey,
        previousAttempts: candidate.media_attempts ?? 0,
        youtubeSearchGate,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      media = buildMediaCandidatePatch(
        {
          poster_url: null,
          poster_source_url: null,
          poster_source_label: null,
          trailer_url: null,
          trailer_provider: null,
          trailer_video_id: null,
          trailer_source: null,
          trailer_source_label: null,
          media_status: DISCOVERY_MEDIA_STATUS.failed,
          media_notes: `Media curator error: ${message}`,
        },
        { previousAttempts: candidate.media_attempts ?? 0 }
      );
    }

    const {
      writes_to_films_table: _w,
      publish: _p,
      enrich_full: _e,
      review_status_unchanged: _r,
      identity_fields_unchanged: _i,
      identity_before: _ib,
      identity_after: _ia,
      identity_unchanged: _iu,
      skipped: _s,
      reason: _reason,
      trailer_origin: trailerOrigin,
      youtube_search_attempted: youtubeSearchAttempted,
      youtube_quota_hit: youtubeQuotaHit,
      ...dbPatch
    } = media;

    results.push({
      id: candidate.id,
      title: candidate.title,
      year: candidate.year,
      media_status: media.media_status,
      poster_url: media.poster_url ?? null,
      trailer_url: media.trailer_url ?? null,
      poster_source_label: media.poster_source_label ?? null,
      trailer_source_label: media.trailer_source_label ?? null,
      media_notes: media.media_notes ?? null,
      trailer_origin: trailerOrigin ?? null,
      youtube_search_attempted: Boolean(youtubeSearchAttempted),
      youtube_quota_hit: Boolean(youtubeQuotaHit),
      skipped: Boolean(media.skipped),
    });

    if (media.skipped) continue;
    wouldUpdate += 1;

    if (!options.dryRun && options.updateFn && candidate.id) {
      await options.updateFn(candidate.id, dbPatch);
    }

    if (delayMs > 0 && index < candidates.length - 1) {
      await sleep(delayMs);
    }
  }

  const tallies = {
    total: candidates.length,
    would_update: wouldUpdate,
    skipped_complete: skippedComplete,
    with_poster: results.filter((r) => r.poster_url).length,
    with_trailer: results.filter((r) => r.trailer_url).length,
    trailers_from_tmdb: results.filter((r) => r.trailer_origin === "tmdb")
      .length,
    trailers_from_youtube: results.filter((r) => r.trailer_origin === "youtube")
      .length,
    youtube_search_attempts: youtubeSearchGate.attempts,
    youtube_quota_errors: youtubeSearchGate.quotaErrors,
    youtube_search_skipped_after_quota: results.filter(
      (r) =>
        typeof r.media_notes === "string" &&
        /blocked by quota\/rate limit/.test(r.media_notes) &&
        !r.youtube_search_attempted
    ).length,
    media_complete: results.filter(
      (r) => r.media_status === DISCOVERY_MEDIA_STATUS.complete
    ).length,
    media_partial: results.filter(
      (r) => r.media_status === DISCOVERY_MEDIA_STATUS.partial
    ).length,
    media_failed: results.filter(
      (r) => r.media_status === DISCOVERY_MEDIA_STATUS.failed
    ).length,
    media_needs_review: results.filter(
      (r) => r.media_status === DISCOVERY_MEDIA_STATUS.needsReview
    ).length,
    youtube_rate_limited: results.filter(
      (r) =>
        typeof r.media_notes === "string" &&
        /blocked by quota\/rate limit/.test(r.media_notes)
    ).length,
  };

  return {
    dryRun: Boolean(options.dryRun),
    databaseMutated: !options.dryRun && wouldUpdate > 0 && Boolean(options.updateFn),
    writes_to_films_table: false,
    review_status_unchanged: true,
    enrich_full: false,
    publish: false,
    tallies,
    results,
  };
}
