"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  groupWatchOffersByCountry,
  isWatchAvailabilityStale,
  normalizeWatchAvailability,
  readWatchCountryFilter,
  watchOfferTypeLabel,
  writeWatchCountryFilter,
} from "@/lib/film-watch-availability.mjs";
import { lockBodyScroll } from "@/lib/modal-body-scroll-lock";
import type { Film } from "@/types/film";

export default function FilmWatchAvailability({ film }: { film: Film }) {
  const titleId = useId();
  const filterId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [availability, setAvailability] = useState(() =>
    normalizeWatchAvailability(film.watch_availability)
  );

  useEffect(() => {
    setAvailability(normalizeWatchAvailability(film.watch_availability));
  }, [film.watch_availability]);

  const countries = groupWatchOffersByCountry(availability?.offers ?? [], {
    appleLinksByRegion: availability?.apple_links?.by_region ?? null,
    mubiCanonicalUrl: availability?.mubi_links?.url ?? null,
  });
  const countryQueryNormalized = countryQuery.trim().toLowerCase();
  const filteredCountries = countryQueryNormalized
    ? countries.filter(
        (row) =>
          row.name.toLowerCase().includes(countryQueryNormalized) ||
          row.code.toLowerCase().includes(countryQueryNormalized) ||
          row.services.some((service) =>
            service.provider.toLowerCase().includes(countryQueryNormalized)
          )
      )
    : countries;

  useEffect(() => {
    setMounted(true);
    setCountryQuery(readWatchCountryFilter());
  }, []);

  useEffect(() => {
    if (!open) return;
    return lockBodyScroll(window.scrollY);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    filterRef.current?.focus();
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function updateCountryQuery(next: string) {
    setCountryQuery(next);
    writeWatchCountryFilter(next);
  }

  async function openWatchDialog() {
    setOpen(true);

    const current = availability;
    if (!isWatchAvailabilityStale(current?.checked_at)) {
      return;
    }

    setRefreshing(true);
    try {
      const response = await fetch("/api/films/watch-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filmId: film.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.watch_availability) {
        const next = normalizeWatchAvailability(payload.watch_availability);
        if (next) {
          setAvailability(next);
        }
      }
    } catch {
      // Keep previously shown data if refresh fails.
    } finally {
      setRefreshing(false);
    }
  }

  if (!availability?.offers.length) {
    return null;
  }

  const dialog =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            data-testid="film-watch-availability-dialog"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setOpen(false);
              }
            }}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="flex max-h-[min(85vh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg outline-none"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="shrink-0 border-b border-stone-100 p-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id={titleId}
                    className="text-[15px] font-medium text-stone-900"
                  >
                    Where to watch
                  </h2>
                  <button
                    type="button"
                    data-testid="film-watch-availability-close"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-2 py-1 text-[13px] text-stone-500 transition hover:bg-stone-50 hover:text-stone-800"
                  >
                    Close
                  </button>
                </div>

                <label htmlFor={filterId} className="sr-only">
                  Filter countries
                </label>
                <input
                  ref={filterRef}
                  id={filterId}
                  type="search"
                  value={countryQuery}
                  onChange={(event) => updateCountryQuery(event.target.value)}
                  placeholder="Find country or service…"
                  data-testid="film-watch-availability-filter"
                  className="mt-3 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
                />
                {refreshing ? (
                  <p
                    className="mt-2 text-[12px] text-stone-400"
                    data-testid="film-watch-availability-refreshing"
                  >
                    Updating…
                  </p>
                ) : null}
              </div>

              <div
                className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
                data-testid="film-watch-availability"
              >
                {filteredCountries.length === 0 ? (
                  <p className="py-6 text-center text-sm text-stone-500">
                    No countries match “{countryQuery.trim()}”.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {filteredCountries.map((country) => (
                      <li key={country.code}>
                        <p className="text-sm font-medium text-stone-900">
                          {country.name}
                          <span className="ml-1.5 font-normal text-stone-400">
                            {country.code}
                          </span>
                        </p>
                        <ul className="mt-1.5 space-y-0.5">
                          {country.services.map((service) => {
                            const typeLabel = watchOfferTypeLabel(service.type);
                            const providerLabel = service.url ? (
                              <a
                                href={service.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-stone-900 underline decoration-stone-300 underline-offset-2 transition hover:text-[#8a5b2d] hover:decoration-[#8a5b2d]"
                              >
                                {service.provider}
                              </a>
                            ) : (
                              <span className="text-stone-800">
                                {service.provider}
                              </span>
                            );
                            return (
                              <li
                                key={`${country.code}:${service.provider}:${service.type}`}
                                className="text-sm leading-5 text-stone-600"
                              >
                                {providerLabel}
                                {typeLabel !== "stream" ? (
                                  <span className="text-stone-400">
                                    {" "}
                                    · {typeLabel}
                                  </span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="shrink-0 border-t border-stone-100 px-4 py-2 text-[11px] text-stone-400">
                {filteredCountries.length}
                {filteredCountries.length === countries.length
                  ? ""
                  : ` of ${countries.length}`}{" "}
                countries · TMDB / JustWatch
              </p>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        data-testid="film-watch-availability-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Where to watch ${film.title}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void openWatchDialog();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="pointer-events-auto inline-flex w-max max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-white/35 bg-black/35 px-3 py-1.5 text-sm font-normal leading-none text-white/90 backdrop-blur-sm transition hover:bg-black/45 hover:text-white"
      >
        <span>Watch</span>
      </button>
      {dialog}
    </>
  );
}
