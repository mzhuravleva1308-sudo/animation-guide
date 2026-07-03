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
      className="overflow-hidden rounded-2xl border border-stone-300 sm:grid sm:grid-cols-[140px_minmax(0,1fr)] md:grid-cols-[190px_minmax(0,1fr)]"
    >
      <div
        data-testid="film-poster"
        className="relative h-72 w-full overflow-hidden bg-gray-100 sm:h-full sm:min-h-full sm:overflow-visible"
      >
        {posterUrl ? (
  <>
    <img
      src={posterUrl}
      alt={film.title}
      loading={lazyLoadPoster ? "lazy" : "eager"}
      decoding="async"
      className="relative z-10 h-full w-full object-cover"
    />

<img
  src={posterUrl}
  alt=""
  aria-hidden="true"
  className="pointer-events-none absolute inset-y-0 left-full z-0 h-full w-6 -translate-x-5 scale-110 object-cover blur-lg opacity-20 brightness-75 sm:w-7 md:w-8"
/>
  </>
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
              className="pointer-events-auto inline-flex w-max max-w-full items-center gap-1.5 whitespace-nowrap rounded-full bg-white/90 px-3.5 py-1.5 text-sm font-medium leading-none text-black shadow-sm backdrop-blur transition hover:bg-white"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0 fill-current"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Trailer</span>
            </a>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="order-2 min-w-0 w-full sm:order-1 sm:flex-1">
      {techniquePills.length > 0 ? (
        <div
          className="mb-1 flex flex-wrap items-center gap-2"
          data-testid="film-technique-pills"
        >
          {techniquePills.map((technique) => (
            <span
              key={technique}
              data-testid="film-technique-pill"
              className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#8a5b2d]"
            >
              {technique}
            </span>
          ))}
        </div>
      ) : null}

      <CopyableFilmTitle title={film.title} />

      {metadataLine ? (
        <p className="mt-1 text-sm text-gray-500">{metadataLine}</p>
      ) : null}

      {showDebugScores && score && (
        <div className="mt-2 space-y-0.5 text-xs text-gray-400">
          <p>Raw emotional: {score.emotional.toFixed(4)}</p>
          <p>Raw material: {score.material.toFixed(4)}</p>
          <p>Balanced total: {score.balanced.toFixed(4)}</p>
        </div>
      )}
    </div>

    {film.festival_badges?.length ? (
      <div className="order-1 w-full sm:order-2 sm:-mt-1.5 sm:w-auto sm:shrink-0">
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
        <div className="border-l-2 border-[#ead8c7] pl-4">
          <p className="text-sm italic leading-6 text-[#8a5b2d] [font-style:oblique_7deg]">
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
