import GuideProseText from "@/components/guides/GuideProseText";
import { GUIDE_PROSE_CLASS } from "@/lib/guides/guide-layout.mjs";

export type GuideShortFilmItem = {
  kind: "short";
  title: string;
  year: number;
  runtimeLabel: string;
  watchUrl: string;
  posterUrl: string | null;
  note: string | null;
};

type GuideShortFilmRowProps = {
  item: GuideShortFilmItem;
};

/**
 * External-watch row for short films that are not in the catalog.
 * Quieter than FilmCard: poster + watch link, no rating/save chrome.
 */
export default function GuideShortFilmRow({ item }: GuideShortFilmRowProps) {
  return (
    <div
      data-testid="guide-short-film"
      className="grid gap-4 border-t border-[#e8e6f0] pt-6 first:border-t-0 first:pt-0 sm:grid-cols-[104px_minmax(0,1fr)] sm:gap-5"
    >
      <div
        data-testid="guide-short-poster"
        className="aspect-[2/3] w-[104px] shrink-0 overflow-hidden rounded-xl bg-[#eeeef4]"
      >
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt=""
            width={104}
            height={156}
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
          <p className="mt-1 text-[13px] leading-5 text-[#7a7b90]">
            Short · {item.year} · {item.runtimeLabel}
          </p>
        </div>
        {item.note ? (
          <p
            data-testid="guide-film-note"
            className={`text-[15px] leading-7 text-[#4a4b5c] ${GUIDE_PROSE_CLASS}`}
          >
            <GuideProseText text={item.note} />
          </p>
        ) : null}
        <a
          href={item.watchUrl}
          target="_blank"
          rel="noreferrer"
          data-testid="guide-short-watch-link"
          className="inline-flex w-max items-center gap-1.5 rounded-full bg-[#1A1B2E] px-4 py-2 text-sm font-medium leading-none text-white transition hover:bg-[#2f3040]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 fill-current"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          Watch
        </a>
      </div>
    </div>
  );
}
