"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buildDiscoveryCatalogFilterPills, formatDiscoveryQuickFilterLabels } from "@/lib/film-discovery-quick-filters.mjs";
import { formatDiscoveryFestivalClaimLabels } from "@/lib/film-discovery-festival-participation.mjs";
import { formatDiscoveryFestivalLabels } from "@/lib/film-discovery-festivals.mjs";
import {
  DISCOVERY_CHILDREN_AUDIENCE_TAG_LABEL,
  discoveryRowPrimarilyForChildren,
} from "@/lib/film-discovery-children-audience.mjs";
import {
  DISCOVERY_PENDING_REVIEW_BUCKET,
  classifyDiscoveryPendingReview,
  partitionDiscoveryPendingReview,
} from "@/lib/film-discovery-pending-review.mjs";

type PendingReviewTab =
  | typeof DISCOVERY_PENDING_REVIEW_BUCKET.looksGood
  | typeof DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention
  | typeof DISCOVERY_PENDING_REVIEW_BUCKET.missingTrailer;

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
  storytelling_tags?: string[] | null;
  quick_filters?: string[] | null;
  has_festival?: boolean | null;
  festival_claims?: Array<{
    festival_name?: string | null;
    festival_year?: number | null;
  }> | null;
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
  release_status?: string | null;
  release_queue_id?: string | null;
  release_blockers?: string[] | null;
  film_id?: string | null;
  review_flags?: string[] | null;
  eligibility_evidence?: Record<string, unknown> | null;
  possible_catalog_duplicates?: Array<{
    id?: string | null;
    title: string;
    year: number;
    match?: string;
    year_delta?: number;
    poster_url?: string | null;
  }> | null;
};

function resolveNearDuplicateMatches(film: DiscoveryCandidateRow) {
  if (
    Array.isArray(film.possible_catalog_duplicates) &&
    film.possible_catalog_duplicates.length > 0
  ) {
    return film.possible_catalog_duplicates;
  }
  const evidence = film.eligibility_evidence;
  const stored = evidence?.possible_catalog_duplicates;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored as NonNullable<
      DiscoveryCandidateRow["possible_catalog_duplicates"]
    >;
  }
  return [];
}

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

function PendingCandidateCard({
  film,
  bucket,
  attentionReasons,
  pendingId,
  isPending,
  rejectDraft,
  trailerDraft,
  activeTrailerId,
  onApprove,
  onReject,
  onRejectReasonChange,
  onTrailerDraftChange,
  onSaveTrailer,
  onOpenTrailer,
}: {
  film: DiscoveryCandidateRow;
  bucket: PendingReviewTab;
  attentionReasons: string[];
  pendingId: string | null;
  isPending: boolean;
  rejectDraft: string;
  trailerDraft: string;
  activeTrailerId: string | null;
  onApprove: () => void;
  onReject: () => void;
  onRejectReasonChange: (value: string) => void;
  onTrailerDraftChange: (value: string) => void;
  onSaveTrailer: () => void;
  onOpenTrailer: () => void;
}) {
  const thumb = youtubeThumb(film.trailer_url);
  const mediaLabel = film.media_status ?? "media_pending";
  const trailerDirty = trailerDraft.trim() !== (film.trailer_url ?? "").trim();
  const savingThis = isPending || pendingId === film.id;
  const nearDupes = resolveNearDuplicateMatches(film);
  const posterColumnClass =
    nearDupes.length > 0
      ? "md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
      : "md:grid-cols-[160px_1fr]";

  return (
    <li
      className="border-t border-gray-200 pt-6"
      data-testid="discovery-candidate"
      data-discovery-bucket={bucket}
    >
      <div className={`grid gap-6 ${posterColumnClass}`}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="w-[140px] shrink-0">
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
              <p className="mt-1 text-xs text-gray-500">
                Candidate
                {film.poster_source_label
                  ? ` · ${film.poster_source_label}`
                  : ""}
              </p>
            </div>

            {nearDupes.length > 0 ? (
              <div
                className="flex flex-wrap gap-3"
                data-testid="discovery-near-dupe-posters"
              >
                {nearDupes.slice(0, 3).map((dupe) => (
                  <div
                    key={`${dupe.id ?? dupe.title}-${dupe.year}`}
                    className="w-[140px] shrink-0"
                    data-testid="discovery-near-dupe-poster"
                  >
                    {dupe.poster_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={dupe.poster_url}
                        alt={`Catalog poster for ${dupe.title}`}
                        className="aspect-[2/3] w-full object-cover bg-gray-100 ring-2 ring-amber-300"
                      />
                    ) : (
                      <div className="flex aspect-[2/3] items-center justify-center bg-gray-100 px-2 text-center text-xs text-gray-500 ring-2 ring-amber-300">
                        No catalog poster
                      </div>
                    )}
                    <p className="mt-1 text-xs text-amber-900">
                      Catalog · {dupe.title} ({dupe.year})
                      {Number.isInteger(dupe.year_delta) &&
                      (dupe.year_delta ?? 0) > 0
                        ? ` · ±${dupe.year_delta}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-medium">
                {film.title} <span className="text-gray-500">({film.year})</span>
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
                <span data-testid="discovery-media-status">{mediaLabel}</span> ·
                content:{" "}
                <span data-testid="discovery-content-status">
                  {contentStatusLabel(film.content_status)}
                </span>
              </p>
              {discoveryRowPrimarilyForChildren(film) ? (
                <p className="mt-2" data-testid="discovery-kids-tag">
                  <span className="inline-flex border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs text-rose-900">
                    {DISCOVERY_CHILDREN_AUDIENCE_TAG_LABEL}
                  </span>
                </p>
              ) : null}
              {attentionReasons.length ? (
                <p
                  className="mt-2 flex flex-wrap gap-1.5"
                  data-testid="discovery-attention-reasons"
                >
                  {attentionReasons.map((reason) => (
                    <span
                      key={reason}
                      className="inline-flex border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900"
                    >
                      {reason}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="discovery-approve"
                disabled={isPending || pendingId === film.id}
                onClick={onApprove}
                className="border border-black bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                data-testid="discovery-reject"
                disabled={isPending || pendingId === film.id}
                onClick={onReject}
                className="border border-gray-400 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>

          <p className="mt-3 text-sm text-gray-700">
            <span className="font-medium">Manager:</span> {film.manager_why ?? "—"}
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
              <span className="font-medium">Synopsis:</span> {film.synopsis ?? "—"}
            </p>
            <p
              className="border-l-2 border-gray-300 pl-3 text-sm italic text-gray-700"
              data-testid="discovery-the-mood"
            >
              {film.the_mood ?? "No mood yet"}
            </p>
            <p className="text-sm text-gray-700" data-testid="discovery-moods">
              <span className="font-medium">Moods:</span>{" "}
              {(film.moods ?? []).length ? (film.moods ?? []).join(", ") : "—"}
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
              data-testid="discovery-storytelling-tags"
            >
              <span className="font-medium">Plot:</span>{" "}
              {(film.storytelling_tags ?? []).length
                ? (film.storytelling_tags ?? []).join(", ")
                : "—"}
            </p>
            <p className="text-sm text-gray-700" data-testid="discovery-has-festival">
              <span className="font-medium">Festival filter:</span>{" "}
              {film.has_festival === true
                ? "yes"
                : film.has_festival === false
                  ? "no"
                  : "—"}
              {(() => {
                const labels = formatDiscoveryFestivalClaimLabels(film.festival_claims);
                return labels.length ? ` (${labels.join("; ")})` : "";
              })()}
            </p>
            <p className="text-sm text-gray-700" data-testid="discovery-festivals">
              <span className="font-medium">Festivals / awards:</span>{" "}
              {(() => {
                const labels = formatDiscoveryFestivalLabels(film.festival_recognitions);
                return labels.length ? labels.join("; ") : "—";
              })()}
            </p>
            <p
              className="text-sm text-gray-700"
              data-testid="discovery-quick-filters"
            >
              <span className="font-medium">Quick filters:</span>{" "}
              {(() => {
                const labels = formatDiscoveryQuickFilterLabels(film.quick_filters);
                return labels.length ? labels.join(", ") : "—";
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
                  has_festival: film.has_festival,
                  festival_claims: film.festival_claims,
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
              <span data-testid="discovery-technique">{film.technique ?? "—"}</span>
            </p>
          </div>

          <div className="mt-3 space-y-2">
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
                    onClick={onOpenTrailer}
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
                      <span className="block px-3 py-6 text-sm">Open trailer</span>
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

            <label className="block text-sm text-gray-600">
              Trailer URL (YouTube, Mubi, …)
              <div className="mt-1 flex max-w-xl flex-wrap items-center gap-2">
                <input
                  type="url"
                  value={trailerDraft}
                  onChange={(event) => onTrailerDraftChange(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=… or Mubi trailer"
                  className="min-w-0 flex-1 border border-gray-300 px-2 py-1"
                  data-testid="discovery-trailer-url-input"
                />
                <button
                  type="button"
                  data-testid="discovery-trailer-save"
                  disabled={savingThis || !trailerDirty}
                  onClick={onSaveTrailer}
                  className="border border-gray-400 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Save trailer
                </button>
              </div>
            </label>
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
              {asUrlList(film.source_urls).length === 0 ? <li>—</li> : null}
            </ul>
          </div>

          <label className="mt-3 block text-sm text-gray-600">
            Reject reason (optional)
            <input
              type="text"
              value={rejectDraft}
              onChange={(event) => onRejectReasonChange(event.target.value)}
              className="mt-1 w-full max-w-xl border border-gray-300 px-2 py-1"
              data-testid="discovery-reject-reason"
            />
          </label>
        </div>
      </div>
    </li>
  );
}

export function FilmDiscoveryReviewDashboard({
  candidates,
}: {
  candidates: DiscoveryCandidateRow[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
  const [trailerDrafts, setTrailerDrafts] = useState<Record<string, string>>(
    {}
  );
  const [activeTrailerId, setActiveTrailerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PendingReviewTab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pending = candidates.filter((row) => row.review_status === "pending_review");
  const decided = candidates.filter((row) => row.review_status !== "pending_review");
  const { needsAttention, looksGood, missingTrailer } =
    partitionDiscoveryPendingReview(pending);

  const tabCounts: Record<PendingReviewTab, number> = {
    [DISCOVERY_PENDING_REVIEW_BUCKET.looksGood]: looksGood.length,
    [DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention]: needsAttention.length,
    [DISCOVERY_PENDING_REVIEW_BUCKET.missingTrailer]: missingTrailer.length,
  };

  const defaultTab: PendingReviewTab =
    missingTrailer.length > 0
      ? DISCOVERY_PENDING_REVIEW_BUCKET.missingTrailer
      : needsAttention.length > 0
        ? DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention
        : DISCOVERY_PENDING_REVIEW_BUCKET.looksGood;

  const selectedTab = activeTab ?? defaultTab;

  function trailerDraftFor(film: DiscoveryCandidateRow): string {
    return Object.prototype.hasOwnProperty.call(trailerDrafts, film.id)
      ? trailerDrafts[film.id]
      : film.trailer_url ?? "";
  }

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

  async function saveTrailer(film: DiscoveryCandidateRow) {
    setError(null);
    setPendingId(film.id);
    try {
      const response = await fetch("/api/admin/film-discovery/trailer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: film.id,
          trailer_url: trailerDraftFor(film),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || `Request failed (${response.status})`);
      }
      setTrailerDrafts((prev) => {
        const next = { ...prev };
        delete next[film.id];
        return next;
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save trailer");
    } finally {
      setPendingId(null);
    }
  }

  const pendingTabs: Array<{
    id: PendingReviewTab;
    label: string;
    description: string;
    films: DiscoveryCandidateRow[];
    testId: string;
  }> = [
    {
      id: DISCOVERY_PENDING_REVIEW_BUCKET.looksGood,
      label: "Looks good",
      description:
        "Poster, trailer, media complete, content ready, and all three tag axes plus festival assessment are filled.",
      films: looksGood,
      testId: "discovery-pending-looks-good",
    },
    {
      id: DISCOVERY_PENDING_REVIEW_BUCKET.needsAttention,
      label: "Needs a careful look",
      description:
        "Missing poster, incomplete media/content, or incomplete tag axes / festival assessment (trailer present).",
      films: needsAttention,
      testId: "discovery-pending-needs-attention",
    },
    {
      id: DISCOVERY_PENDING_REVIEW_BUCKET.missingTrailer,
      label: "No trailer",
      description:
        "Paste a YouTube or Mubi trailer URL, then save. Other review flags still show on the card.",
      films: missingTrailer,
      testId: "discovery-pending-missing-trailer",
    },
  ];

  const activePendingTab =
    pendingTabs.find((tab) => tab.id === selectedTab) ?? pendingTabs[0];

  function renderPendingList(
    films: DiscoveryCandidateRow[],
    bucket: PendingReviewTab
  ) {
    return (
      <ul className="mt-6 space-y-10">
        {films.map((film) => {
          const attention = classifyDiscoveryPendingReview(film);
          return (
            <PendingCandidateCard
              key={film.id}
              film={film}
              bucket={bucket}
              attentionReasons={
                bucket === DISCOVERY_PENDING_REVIEW_BUCKET.looksGood
                  ? []
                  : attention.reasons
              }
              pendingId={pendingId}
              isPending={isPending}
              rejectDraft={rejectDrafts[film.id] ?? ""}
              trailerDraft={trailerDraftFor(film)}
              activeTrailerId={activeTrailerId}
              onApprove={() => submit(film.id, "approve")}
              onReject={() => submit(film.id, "reject")}
              onRejectReasonChange={(value) =>
                setRejectDrafts((prev) => ({ ...prev, [film.id]: value }))
              }
              onTrailerDraftChange={(value) =>
                setTrailerDrafts((prev) => ({ ...prev, [film.id]: value }))
              }
              onSaveTrailer={() => saveTrailer(film)}
              onOpenTrailer={() => setActiveTrailerId(film.id)}
            />
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-10">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">
            Pending review ({pending.length})
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Review poster, trailer, and identity. Approve does not publish, enrich,
            or write to the public catalog.
          </p>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm text-gray-500">No candidates awaiting review.</p>
        ) : (
          <>
            <div
              className="flex flex-wrap gap-2 border-b border-gray-200"
              role="tablist"
              aria-label="Pending review filters"
              data-testid="discovery-pending-tabs"
            >
              {pendingTabs.map((tab) => {
                const selected = tab.id === selectedTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    data-testid={`discovery-pending-tab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
                      selected
                        ? "border-black font-medium text-black"
                        : "border-transparent text-gray-500 hover:text-black"
                    }`}
                  >
                    {tab.label}{" "}
                    <span className="tabular-nums text-gray-500">
                      ({tabCounts[tab.id]})
                    </span>
                  </button>
                );
              })}
            </div>

            <div
              role="tabpanel"
              data-testid={activePendingTab.testId}
              data-discovery-tab={activePendingTab.id}
            >
              <p className="text-sm text-gray-600">
                {activePendingTab.description}
              </p>
              {activePendingTab.films.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">
                  Nothing in this queue right now.
                </p>
              ) : (
                renderPendingList(activePendingTab.films, activePendingTab.id)
              )}
            </div>
          </>
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
                {film.release_status
                  ? ` · release=${film.release_status}`
                  : ""}
                {film.reject_reason ? ` · ${film.reject_reason}` : ""}
                {film.release_status &&
                film.release_status !== "not_queued" &&
                film.review_status === "approved" ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href="/admin/film-releases"
                      className="text-gray-600 underline hover:text-black"
                    >
                      In release queue
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
