import GuideProseText from "@/components/guides/GuideProseText";
import TrackedExternalLink from "@/components/TrackedExternalLink";
import { GUIDE_PROSE_CLASS } from "@/lib/guides/guide-layout.mjs";

export type GuideShortPosterAspect = "portrait" | "landscape";

export type GuideShortFilmItem = {
  kind: "short";
  title: string;
  year: number;
  runtimeLabel: string;
  watchUrl: string;
  trailerUrl: string | null;
  country: string | null;
  director: string | null;
  posterUrl: string | null;
  /** Page-level short poster shape. Keep one aspect per guide for visual consistency. */
  posterAspect: GuideShortPosterAspect;
  note: string | null;
};

type GuideShortFilmRowProps = {
  item: GuideShortFilmItem;
};

const watchButtonClassName =
  "inline-flex w-max items-center gap-1.5 rounded-full bg-[#1A1B2E] px-4 py-2 text-sm font-medium leading-none text-white transition hover:bg-[#2f3040]";

const trailerButtonClassName =
  "inline-flex w-max items-center gap-1.5 rounded-full border border-[#1A1B2E]/20 bg-white px-4 py-2 text-sm font-medium leading-none text-[#1A1B2E] transition hover:border-[#1A1B2E]/35 hover:bg-[#f7f7fb]";

function shortMetaLine(item: GuideShortFilmItem) {
  return [item.country, item.director, String(item.year), item.runtimeLabel]
    .filter(Boolean)
    .join(" · ");
}

/**
 * External-watch row for short films that are not in the catalog.
 * Quieter than FilmCard: poster + watch link, no rating/save chrome.
 * When there is no free stream, `trailerUrl` adds a Trailer button beside Watch.
 */
export default function GuideShortFilmRow({ item }: GuideShortFilmRowProps) {
  const meta = shortMetaLine(item);
  const portrait = item.posterAspect === "portrait";

  return (
    <div
      data-testid="guide-short-film"
      className={
        portrait
          ? "grid gap-4 border-t border-[#e8e6f0] pt-6 first:border-t-0 first:pt-0 sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-5"
          : "grid gap-4 border-t border-[#e8e6f0] pt-6 first:border-t-0 first:pt-0 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-5"
      }
    >
      <div
        data-testid="guide-short-poster"
        data-poster-aspect={item.posterAspect}
        className={
          portrait
            ? "aspect-[2/3] w-[104px] shrink-0 overflow-hidden rounded-xl bg-[#eeeef4]"
            : "aspect-video w-full max-w-[320px] shrink-0 overflow-hidden rounded-xl bg-[#eeeef4] sm:max-w-none sm:w-[240px]"
        }
      >
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt=""
            width={portrait ? 104 : 240}
            height={portrait ? 156 : 135}
            decoding="async"
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 grid gap-3 content-start">
        <div className="min-w-0">
          <h3 className="font-sans text-[17px] font-medium leading-snug tracking-tight text-[#1A1B2E] antialiased [font-synthesis:none]">
            {item.title}
          </h3>
          {meta ? (
            <p
              data-testid="guide-short-meta"
              className="mt-1 text-[13px] leading-5 text-[#7a7b90]"
            >
              {meta}
            </p>
          ) : null}
        </div>
        {item.note ? (
          <p
            data-testid="guide-film-note"
            className={`text-[16px] leading-[1.65] text-[#4a4b5c] ${GUIDE_PROSE_CLASS}`}
          >
            <GuideProseText text={item.note} />
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {item.trailerUrl ? (
            <TrackedExternalLink
              href={item.trailerUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="guide-short-trailer-link"
              eventName="trailer_link_clicked"
              eventProperties={{
                film_title: item.title,
                provider: "guide_short_trailer",
              }}
              className={trailerButtonClassName}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0 fill-current"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              Trailer
            </TrackedExternalLink>
          ) : null}
          <TrackedExternalLink
            href={item.watchUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="guide-short-watch-link"
            eventName="watch_link_clicked"
            eventProperties={{
              film_title: item.title,
              provider: item.trailerUrl
                ? "guide_short_where_to_watch"
                : "guide_short_external",
            }}
            className={watchButtonClassName}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 fill-current"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            Watch
          </TrackedExternalLink>
        </div>
      </div>
    </div>
  );
}
