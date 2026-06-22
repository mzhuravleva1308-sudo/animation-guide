import { FilmScore } from "@/lib/profile-film-scoring";
import { Film } from "@/types/film";
import { normalizeFilmTagList } from "@/lib/film-tags";
import { getFilmTechniquePills } from "@/lib/film-technique";
import RatingButtons from "@/components/RatingButtons";
import WatchlistButton from "@/components/WatchlistButton";
import { getFilmPosterUrl } from "@/lib/film-poster";
import type { PendingFilmActionInput } from "@/lib/pending-film-action";
import { FestivalBadgeList } from "@/components/FestivalBadge";
import CopyableFilmTitle from "@/components/CopyableFilmTitle";

type FilmCardBaseProps = {
  film: Film;
  reason?: string;
  score?: FilmScore | null;
  showDebugScores?: boolean;
  lazyLoadPoster?: boolean;
};

type FilmCardProfileProps = FilmCardBaseProps & {
  mode?: "profile";
  profileId: string;
  profileSlug: string;
  initialRating: number | null;
  savedFilmIds: Set<string>;
  onSavedChange: (film: Film, saved: boolean) => void;
  onRatingChange: (
    filmId: string,
    rating: number | null,
    options?: { skipOrderUpdate?: boolean }
  ) => void;
};

type FilmCardPublicProps = FilmCardBaseProps & {
  mode: "public";
};

type FilmCardCatalogProps = FilmCardBaseProps & {
  mode: "catalog";
  profileId?: string;
  profileSlug?: string;
  initialRating: number | null;
  savedFilmIds: Set<string>;
  onSavedChange: (film: Film, saved: boolean) => void;
  onRatingChange: (
    filmId: string,
    rating: number | null,
    options?: { skipOrderUpdate?: boolean }
  ) => void;
  onAuthRequired?: (action: PendingFilmActionInput) => void;
};

export type FilmCardProps =
  | FilmCardProfileProps
  | FilmCardPublicProps
  | FilmCardCatalogProps;

export default function FilmCard(props: FilmCardProps) {
  const {
    film,
    reason,
    score = null,
    showDebugScores = false,
    lazyLoadPoster = false,
  } = props;

  const moods = normalizeFilmTagList(film.moods);
  const aestheticTags = normalizeFilmTagList(film.aesthetic_tags);
  const narrativeTags = normalizeFilmTagList(film.narrative_tags);
  const posterUrl = getFilmPosterUrl(film);
  const techniquePills = getFilmTechniquePills(film.technique);
  const metadataLine = [
    film.director,
    film.year,
    film.country,
    film.duration_minutes ? `${film.duration_minutes} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const showInteractionControls =
    props.mode === "profile" || props.mode === "catalog";

  return (
    <article
      data-testid="film-card"
      data-film-id={film.id}
      className="grid gap-4 rounded-2xl border p-5 md:grid-cols-[160px_1fr] md:items-stretch"
    >
      <div
        data-testid="film-poster"
        className="relative h-56 w-full overflow-hidden rounded-xl bg-gray-100 md:h-60"
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={film.title}
            loading={lazyLoadPoster ? "lazy" : "eager"}
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No image
          </div>
        )}

        {film.trailer_url && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
            <a
              href={film.trailer_url}
              target="_blank"
              rel="noreferrer"
              data-testid="film-trailer-link"
              className="pointer-events-auto inline-flex w-max max-w-full items-center gap-1 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium leading-none text-black shadow-sm backdrop-blur hover:bg-white"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-3 w-3 shrink-0 fill-current"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Trailer</span>
            </a>
          </div>
        )}
      </div>

      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
          <CopyableFilmTitle title={film.title} />
            {(metadataLine || techniquePills.length > 0) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                {metadataLine ? (
                  <p className="text-sm text-gray-500">{metadataLine}</p>
                ) : null}
                {techniquePills.length > 0 ? (
                  <span
                    className="inline-flex flex-wrap items-center gap-1"
                    data-testid="film-technique-pills"
                  >
                    {techniquePills.map((technique) => (
                      <span
                        key={technique}
                        data-testid="film-technique-pill"
                        className="inline-flex items-center rounded-full border border-gray-200/80 bg-gray-50 px-2 py-0.5 text-[10px] font-medium leading-none text-gray-600"
                      >
                        {technique}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            )}
            {showDebugScores && score && (
              <div className="mt-2 space-y-0.5 text-xs text-gray-400">
                <p>Raw emotional: {score.emotional.toFixed(4)}</p>
                <p>Raw material: {score.material.toFixed(4)}</p>
                <p>Balanced total: {score.balanced.toFixed(4)}</p>
              </div>
            )}
          </div>

          {film.festival_badges?.length ? (
            <div className="shrink-0 pt-0.5">
              <FestivalBadgeList badges={film.festival_badges} />
            </div>
          ) : null}

          {film.availability && film.availability !== "unknown" && (
            <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
              {film.availability}
            </span>
          )}
        </div>

        {reason && (
          <p className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
            {reason}
          </p>
        )}

        {!reason && (film.what_it_is || film.the_mood) && (
          <div className="mt-3 space-y-2.5">
            {film.what_it_is && (
              <p className="text-sm leading-6 text-gray-900">{film.what_it_is}</p>
            )}
            {film.the_mood && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400">
                  The mood
                </p>
                <p className="mt-0.5 text-sm leading-6 text-gray-600">
                  {film.the_mood}
                </p>
              </div>
            )}
          </div>
        )}

        {showDebugScores && (
          <div className="mt-4 space-y-3">
            {moods.length ? (
              <div>
                <div className="flex flex-wrap gap-2">
                  {moods.map((mood) => (
                    <span
                      key={mood}
                      className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                    >
                      {mood}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {aestheticTags.length ? (
              <div>
                <div className="flex flex-wrap gap-2">
                  {aestheticTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {narrativeTags.length ? (
              <div>
                <div className="flex flex-wrap gap-2">
                  {narrativeTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {film.technique && (
              <div>
                <span className="inline-flex rounded-full bg-gray-50 px-3 py-1 text-sm text-gray-500">
                  {film.technique}
                </span>
              </div>
            )}
          </div>
        )}

        {showInteractionControls && (
          <div className="mt-auto flex items-end justify-between gap-6 pt-4">
            <RatingButtons
              filmId={film.id}
              profileId={props.profileId}
              initialRating={props.initialRating}
              onRatingChange={props.onRatingChange}
              onAuthRequired={
                props.mode === "catalog" ? props.onAuthRequired : undefined
              }
            />
            <WatchlistButton
              filmId={film.id}
              profileSlug={props.profileSlug}
              profileId={props.profileId}
              isSaved={props.savedFilmIds.has(film.id)}
              onSavedChange={(saved) => props.onSavedChange(film, saved)}
              onAuthRequired={
                props.mode === "catalog" ? props.onAuthRequired : undefined
              }
            />
          </div>
        )}
      </div>
    </article>
  );
}
