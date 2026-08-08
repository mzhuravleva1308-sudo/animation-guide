"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buildDiscoveryCatalogFilterPills } from "@/lib/film-discovery-quick-filters.mjs";
import { formatDiscoveryFestivalLabels } from "@/lib/film-discovery-festivals.mjs";

export type DiscoveryCandidateRow = {
  id: string;
  title: string;
  original_title: string | null;
  year: number;
  directors: string[];
  countries: string[];
  runtime_minutes: number | null;
  source_urls: string[] | unknown;
  manager_why: string | null;
  researcher_why: string | null;
  eligibility_result: string | null;
  review_status: string;
  reject_reason: string | null;
  source: string;
  created_at: string;
  poster_url?: string | null;
  poster_source_label?: string | null;
  trailer_url?: string | null;
  trailer_source_label?: string | null;
  media_status?: string | null;
  media_notes?: string | null;
  synopsis?: string | null;
  the_mood?: string | null;
  technique?: string | null;
  moods?: string[] | null;
  aesthetic_tags?: string[] | null;
  quick_filters?: string[] | null;
  festival_recognitions?: Array<{
    festival_name?: string | null;
    festival_year?: number | null;
    award_name?: string | null;
    award_result?: string | null;
    recognition_type?: string | null;
  }> | null;
  content_status?: string | null;
  content_note?: string | null;
  content_revision_count?: number | null;
};

function asUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function contentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "ready":
    case "ready_with_note":
      return "ready";
    case "failed":
      return "failed";
    case "pending":
    case null:
    case undefined:
      return "pending";
    default:
      return status;
  }
}

function youtubeThumb(trailerUrl: string | null | undefined): string | null {
  if (!trailerUrl) return null;
  const match = trailerUrl.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

export function FilmDiscoveryReviewDashboard({
  candidates,
}: {
  candidates: DiscoveryCandidateRow[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
  const [activeTrailerId, setActiveTrailerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pending = candidates.filter((row) => row.review_status === "pending_review");
  const decided = candidates.filter((row) => row.review_status !== "pending_review");

  async function submit(id: string, action: "approve" | "reject") {
    setError(null);
    setPendingId(id);
    try {
      const response = await fetch("/api/admin/film-discovery/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          reject_reason: action === "reject" ? rejectDrafts[id] ?? null : null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || `Request failed (${response.status})`);
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-10">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="text-xl font-semibold">
          Pending review ({pending.length})
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Review poster, trailer, and identity. Approve does not publish, enrich,
          or write to the public catalog.
        </p>

        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No candidates awaiting review.</p>
        ) : (
          <ul className="mt-6 space-y-10">
            {pending.map((film) => {
              const thumb = youtubeThumb(film.trailer_url);
              const mediaLabel = film.media_status ?? "media_pending";
              return (
                <li
                  key={film.id}
                  className="border-t border-gray-200 pt-6"
                  data-testid="discovery-candidate"
                >
                  <div className="grid gap-6 md:grid-cols-[160px_1fr]">
                    <div>
                      {film.poster_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={film.poster_url}
                          alt={`Poster for ${film.title}`}
                          data-testid="discovery-poster"
                          className="aspect-[2/3] w-full object-cover bg-gray-100"
                        />
                      ) : (
                        <div
                          className="flex aspect-[2/3] items-center justify-center bg-gray-100 px-2 text-center text-xs text-gray-500"
                          data-testid="discovery-poster-missing"
                        >
                          No poster found
                        </div>
                      )}
                      {film.poster_source_label ? (
                        <p className="mt-1 text-xs text-gray-500">
                          {film.poster_source_label}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-medium">
                            {film.title}{" "}
                            <span className="text-gray-500">({film.year})</span>
                          </h3>
                          <p className="text-sm text-gray-600">
                            Original: {film.original_title ?? "—"}
                          </p>
                          <p className="text-sm text-gray-600">
                            {(film.directors ?? []).join(", ") || "—"} ·{" "}
                            {(film.countries ?? []).join(", ") || "—"} ·{" "}
                            {film.runtime_minutes ?? "—"} min
                          </p>
                          <p className="mt-2 text-xs uppercase tracking-wide text-gray-500">
                            source: {film.source} · eligibility:{" "}
                            {film.eligibility_result ?? "n/a"} · media:{" "}
                            <span data-testid="discovery-media-status">
                              {mediaLabel}
                            </span>{" "}
                            · content:{" "}
                            <span data-testid="discovery-content-status">
                              {contentStatusLabel(film.content_status)}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-testid="discovery-approve"
                            disabled={isPending || pendingId === film.id}
                            onClick={() => submit(film.id, "approve")}
                            className="border border-black bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            data-testid="discovery-reject"
                            disabled={isPending || pendingId === film.id}
                            onClick={() => submit(film.id, "reject")}
                            className="border border-gray-400 px-3 py-1.5 text-sm disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>

                      <p className="mt-3 text-sm text-gray-700">
                        <span className="font-medium">Manager:</span>{" "}
                        {film.manager_why ?? "—"}
                      </p>
                      <p className="mt-1 text-sm text-gray-700">
                        <span className="font-medium">Researcher:</span>{" "}
                        {film.researcher_why ?? "—"}
                      </p>
                      {film.media_notes ? (
                        <p
                          className="mt-2 text-sm text-amber-800"
                          data-testid="discovery-media-notes"
                        >
                          Media notes: {film.media_notes}
                        </p>
                      ) : null}

                      <div className="mt-4 space-y-2" data-testid="discovery-content">
                        <p className="text-sm text-gray-800" data-testid="discovery-synopsis">
                          <span className="font-medium">Synopsis:</span>{" "}
                          {film.synopsis ?? "—"}
                        </p>
                        <p
                          className="border-l-2 border-gray-300 pl-3 text-sm italic text-gray-700"
                          data-testid="discovery-the-mood"
                        >
                          {film.the_mood ?? "No mood yet"}
                        </p>
                        <p className="text-sm text-gray-700" data-testid="discovery-moods">
                          <span className="font-medium">Moods:</span>{" "}
                          {(film.moods ?? []).length
                            ? (film.moods ?? []).join(", ")
                            : "—"}
                        </p>
                        <p
                          className="text-sm text-gray-700"
                          data-testid="discovery-aesthetic-tags"
                        >
                          <span className="font-medium">Material / aesthetic:</span>{" "}
                          {(film.aesthetic_tags ?? []).length
                            ? (film.aesthetic_tags ?? []).join(", ")
                            : "—"}
                        </p>
                        <p
                          className="text-sm text-gray-700"
                          data-testid="discovery-festivals"
                        >
                          <span className="font-medium">Festivals / awards:</span>{" "}
                          {(() => {
                            const labels = formatDiscoveryFestivalLabels(
                              film.festival_recognitions
                            );
                            return labels.length ? labels.join("; ") : "—";
                          })()}
                        </p>
                        <div
                          className="text-sm text-gray-700"
                          data-testid="discovery-catalog-filters"
                        >
                          <span className="font-medium">Catalog filters:</span>{" "}
                          {(() => {
                            const pills = buildDiscoveryCatalogFilterPills({
                              year: film.year,
                              technique: film.technique,
                              quick_filters: film.quick_filters,
                              festival_recognitions: film.festival_recognitions,
                            });
                            if (!pills.length) {
                              return <span className="text-gray-500">—</span>;
                            }
                            return (
                              <span className="mt-1 flex flex-wrap gap-1.5">
                                {pills.map((pill) => (
                                  <span
                                    key={`${pill.source}-${pill.id}`}
                                    className="inline-flex items-center border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs text-gray-800"
                                    title={
                                      pill.source === "derived"
                                        ? "Derived from year/technique/festivals"
                                        : "Proposed quick_filters token"
                                    }
                                    data-testid={`discovery-catalog-filter-${pill.id}`}
                                  >
                                    {pill.label}
                                    <span className="ml-1 text-[10px] uppercase tracking-wide text-gray-500">
                                      {pill.source === "derived" ? "auto" : "proposed"}
                                    </span>
                                  </span>
                                ))}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Technique:{" "}
                          <span data-testid="discovery-technique">
                            {film.technique ?? "—"}
                          </span>
                        </p>
                      </div>

                      <div className="mt-3">
                        {film.trailer_url ? (
                          <div data-testid="discovery-trailer">
                            {activeTrailerId === film.id ? (
                              <p className="text-sm">
                                <a
                                  href={film.trailer_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline"
                                >
                                  Open trailer
                                </a>
                                {film.trailer_source_label
                                  ? ` · ${film.trailer_source_label}`
                                  : ""}
                              </p>
                            ) : (
                              <button
                                type="button"
                                className="relative block overflow-hidden border border-gray-200"
                                onClick={() => setActiveTrailerId(film.id)}
                                data-testid="discovery-trailer-open"
                              >
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={thumb}
                                    alt={`Trailer preview for ${film.title}`}
                                    className="h-28 w-48 object-cover"
                                  />
                                ) : (
                                  <span className="block px-3 py-6 text-sm">
                                    Open trailer
                                  </span>
                                )}
                                <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs font-medium text-white">
                                  Trailer
                                </span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <p
                            className="text-sm text-gray-500"
                            data-testid="discovery-trailer-missing"
                          >
                            No trailer found
                          </p>
                        )}
                      </div>

                      <div className="mt-2 text-sm text-gray-600">
                        Sources:
                        <ul className="list-disc pl-5">
                          {asUrlList(film.source_urls).map((url) => (
                            <li key={url}>
                              <a
                                href={url}
                                className="underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                {url}
                              </a>
                            </li>
                          ))}
                          {asUrlList(film.source_urls).length === 0 ? (
                            <li>—</li>
                          ) : null}
                        </ul>
                      </div>

                      <label className="mt-3 block text-sm text-gray-600">
                        Reject reason (optional)
                        <input
                          type="text"
                          value={rejectDrafts[film.id] ?? ""}
                          onChange={(event) =>
                            setRejectDrafts((prev) => ({
                              ...prev,
                              [film.id]: event.target.value,
                            }))
                          }
                          className="mt-1 w-full max-w-xl border border-gray-300 px-2 py-1"
                          data-testid="discovery-reject-reason"
                        />
                      </label>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold">
          Already decided ({decided.length})
        </h2>
        {decided.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No decisions yet.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {decided.map((film) => (
              <li key={film.id}>
                <span className="font-medium">{film.review_status}</span> —{" "}
                {film.title} ({film.year})
                {film.media_status ? ` · ${film.media_status}` : ""}
                {film.reject_reason ? ` · ${film.reject_reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
