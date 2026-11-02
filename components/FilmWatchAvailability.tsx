"use client";

import { normalizeWatchAvailability } from "@/lib/film-watch-availability.mjs";
import type { Film } from "@/types/film";

/** Temporary: skip the in-app offers popup; send users to Google's where-to-watch card. */
export function googleWhereToWatchUrl(title: string) {
  const q = `${String(title ?? "").trim()} where to watch`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export default function FilmWatchAvailability({ film }: { film: Film }) {
  const availability = normalizeWatchAvailability(film.watch_availability);
  if (!availability?.offers.length) {
    return null;
  }

  const href = googleWhereToWatchUrl(film.title);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-testid="film-watch-availability-button"
      aria-label={`Where to watch ${film.title} on Google`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto inline-flex w-max max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-white/35 bg-black/35 px-3 py-1.5 text-sm font-normal leading-none text-white/90 backdrop-blur-sm transition hover:bg-black/45 hover:text-white"
    >
      <span>Watch</span>
    </a>
  );
}
