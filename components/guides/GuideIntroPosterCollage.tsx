"use client";

import type { CSSProperties } from "react";

export type GuideIntroPosterFilm = {
  id: string;
  title: string;
  posterUrl: string;
};

/**
 * Absolute collage from the reference mock (tablet / desktop).
 * Widths vary a lot horizontally; most keep poster 2/3 via aspectRatio.
 * Only Wonderland is landscape. Tops/bottoms stay ragged (not a rectangle).
 */
const COLLAGE_SLOTS = [
  // left — Anzu narrow, Begonia a bit wider
  { filmIndex: 0, left: 0, top: 10, width: 17, aspect: "2 / 3" }, // Anzu
  { filmIndex: 1, left: 0, top: 46, width: 19, aspect: "2 / 3" }, // Begonia
  // center-left — widest portraits
  { filmIndex: 2, left: 19.5, top: 0, width: 25, aspect: "2 / 3" }, // Children
  { filmIndex: 4, left: 20.5, top: 55, width: 22, aspect: "2 / 3" }, // Lu
  // center-right
  { filmIndex: 3, left: 48, top: 7, width: 25, aspect: "1 / 1" }, // Pom
  { filmIndex: 6, left: 46, top: 42, width: 27, aspect: "5 / 3" }, // Wonderland
  { filmIndex: 7, left: 46, top: 67, width: 27, aspect: "1 / 1" }, // Kubo
  // right
  { filmIndex: 5, left: 76, top: 0, width: 24, aspect: "2 / 3" }, // Hei
  { filmIndex: 8, left: 77, top: 50, width: 23, aspect: "2 / 3" }, // Nahuel
] as const;

/**
 * Narrow-phone layout from mobile mock: 3 staggered columns + underlay peek.
 * Col order matches the reference, not the desktop absolute slots.
 */
const MOBILE_COLUMNS: readonly {
  filmIndexes: readonly number[];
  offsetClass: string;
  /** First card in middle column is a bit taller in the mock. */
  tallFirst?: boolean;
}[] = [
  { filmIndexes: [0, 1, 5], offsetClass: "pt-5" }, // Anzu, Begonia, Hei
  { filmIndexes: [2, 4, 7], offsetClass: "pt-0", tallFirst: true }, // Children, Lu, Kubo
  { filmIndexes: [3, 6, 8], offsetClass: "pt-7" }, // Pom, Wonderland, Nahuel
];

function scrollToGuideFilm(filmId: string) {
  document
    .getElementById(`guide-film-${filmId}`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Per-title crop tweaks inside square/collage frames. */
const POSTER_OBJECT_POSITION: Record<string, string> = {
  Paprika: "center 22%",
  "Pom Poko": "center 82%",
  "Sirocco and the Kingdom of the Winds": "center 62%",
  "Marona's Fantastic Tale": "center 0%",
};

type GuideIntroUnderlay = {
  src: string;
  title: string;
};

type GuideIntroPosterCollageProps = {
  films: GuideIntroPosterFilm[];
  underlay?: GuideIntroUnderlay | null;
  /** Compact for shorter intros (Coraline / Flow). */
  size?: "default" | "compact";
};

const DESKTOP_FRAME = {
  default: {
    wrapper: "relative mt-8 shrink-0 lg:mt-16",
    underlayPad: "pl-[clamp(10rem,18vw,15rem)]",
    underlayBox:
      "pointer-events-none absolute -top-[6%] bottom-[-4%] left-0 z-0 w-[min(100%,36rem)]",
    collage:
      "group/collage relative z-10 h-[clamp(230px,27vw,360px)] w-[clamp(290px,34vw,450px)]",
  },
  compact: {
    wrapper: "relative mt-8 shrink-0 lg:mt-12",
    underlayPad: "pl-[clamp(8rem,14vw,12rem)]",
    underlayBox:
      "pointer-events-none absolute -top-[6%] bottom-[-4%] left-0 z-0 w-[min(100%,29rem)]",
    collage:
      "group/collage relative z-10 h-[clamp(190px,22vw,295px)] w-[clamp(240px,28vw,370px)]",
  },
} as const;

const MOBILE_FRAME = {
  default: {
    wrapper: "relative mt-6 w-full shrink-0",
    underlayPad: "pl-[clamp(4rem,30vw,7.5rem)]",
    underlayBox:
      "pointer-events-none absolute inset-y-[-8%] left-0 z-0 w-[min(88%,17rem)]",
  },
  compact: {
    wrapper: "relative mt-6 w-full shrink-0",
    underlayPad: "pl-[clamp(3.5rem,28vw,6.5rem)]",
    underlayBox:
      "pointer-events-none absolute inset-y-[-8%] left-0 z-0 w-[min(84%,15rem)]",
  },
} as const;

const posterButtonClassName =
  "cursor-pointer overflow-hidden rounded-[10px] bg-[#f3f2f5] opacity-[0.92] shadow-[0_5px_14px_rgba(26,27,46,0.10)] outline-offset-2 transition-[opacity,transform,box-shadow] duration-300 ease-out sm:rounded-[12px] group-hover/collage:opacity-[0.55] hover:z-10 hover:scale-[1.04] hover:!opacity-100 hover:shadow-[0_10px_24px_rgba(26,27,46,0.16)] focus-visible:z-10 focus-visible:scale-[1.04] focus-visible:!opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1A1B2E] active:scale-[1.04] active:opacity-100";

function PosterImage({
  film,
  width,
  height,
  eager,
}: {
  film: GuideIntroPosterFilm;
  width: number;
  height: number;
  eager?: boolean;
}) {
  return (
    <img
      src={film.posterUrl}
      alt=""
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className="h-full w-full object-cover"
      style={
        POSTER_OBJECT_POSITION[film.title]
          ? { objectPosition: POSTER_OBJECT_POSITION[film.title] }
          : undefined
      }
    />
  );
}

/**
 * <550px: 3-column stack + underlay.
 * ≥550px: absolute desktop collage (sizes restored).
 * Visibility switched in globals.css (.guide-intro-collage-*).
 */
export default function GuideIntroPosterCollage({
  films,
  underlay = null,
  size = "default",
}: GuideIntroPosterCollageProps) {
  if (films.length === 0) return null;

  const desktop = DESKTOP_FRAME[size] ?? DESKTOP_FRAME.default;
  const mobile = MOBILE_FRAME[size] ?? MOBILE_FRAME.default;

  return (
    <>
      <div
        className={`guide-intro-collage-mobile ${mobile.wrapper}${
          underlay ? ` ${mobile.underlayPad}` : ""
        }`}
      >
        {underlay ? (
          <div
            aria-hidden="true"
            data-testid="guide-intro-anchor-underlay"
            className={mobile.underlayBox}
          >
            <img
              src={underlay.src}
              alt=""
              width={900}
              height={620}
              decoding="async"
              className="h-full w-full scale-[1.22] object-contain object-left object-bottom"
            />
          </div>
        ) : null}

        <div
          data-testid="guide-intro-poster-collage"
          aria-label="Films in this guide"
          className="group/collage relative z-10 grid w-full grid-cols-3 gap-1.5"
        >
          {MOBILE_COLUMNS.map((column, columnIndex) => (
            <div
              key={`mobile-col-${columnIndex}`}
              className={`flex flex-col gap-1.5 ${column.offsetClass}`}
            >
              {column.filmIndexes.map((filmIndex, rowIndex) => {
                const film = films[filmIndex];
                if (!film) return null;
                const tall = Boolean(column.tallFirst && rowIndex === 0);

                return (
                  <button
                    key={`mobile-${film.id}`}
                    type="button"
                    title={film.title}
                    aria-label={`Jump to ${film.title}`}
                    data-testid="guide-intro-poster"
                    onClick={() => scrollToGuideFilm(film.id)}
                    className={`${posterButtonClassName} w-full ${
                      tall ? "aspect-[2/3.35]" : "aspect-[2/3]"
                    }`}
                  >
                    <PosterImage
                      film={film}
                      width={120}
                      height={tall ? 200 : 180}
                      eager={columnIndex === 0 && rowIndex < 2}
                    />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div
        className={`guide-intro-collage-desktop ${desktop.wrapper}${
          underlay ? ` ${desktop.underlayPad}` : ""
        }`}
      >
        {underlay ? (
          <div aria-hidden="true" className={desktop.underlayBox}>
            <img
              src={underlay.src}
              alt=""
              width={900}
              height={620}
              decoding="async"
              className="h-full w-full scale-110 object-contain object-left"
            />
          </div>
        ) : null}

        <div
          data-testid="guide-intro-poster-collage"
          aria-label="Films in this guide"
          className={desktop.collage}
        >
          {COLLAGE_SLOTS.map((slot, index) => {
            const film = films[slot.filmIndex];
            if (!film) return null;

            const style = {
              left: `${slot.left}%`,
              top: `${slot.top}%`,
              width: `${slot.width}%`,
              ...("height" in slot
                ? { height: `${slot.height}%` }
                : { aspectRatio: slot.aspect }),
            } as CSSProperties;

            return (
              <button
                key={`desktop-${film.id}`}
                type="button"
                title={film.title}
                aria-label={`Jump to ${film.title}`}
                data-testid="guide-intro-poster"
                onClick={() => scrollToGuideFilm(film.id)}
                style={style}
                className={`absolute ${posterButtonClassName}`}
              >
                <PosterImage
                  film={film}
                  width={180}
                  height={270}
                  eager={index < 4}
                />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
