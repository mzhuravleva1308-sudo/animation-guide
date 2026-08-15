"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export type ReleaseQueueRow = {
  id: string;
  title: string;
  year: number;
  status: string;
  result_status: string | null;
  result_message: string | null;
  result_checklist: Record<string, unknown> | null;
  origin: string | null;
  discovery_candidate_id: string | null;
  film_id: string | null;
  created_at: string;
  finished_at: string | null;
  film?: {
    id: string;
    title: string;
    catalog_visible: boolean | null;
    poster_url: string | null;
  } | null;
  candidate?: {
    id: string;
    release_status: string | null;
    release_blockers: string[] | null;
  } | null;
};

function checklistEntries(checklist: Record<string, unknown> | null | undefined) {
  if (!checklist || typeof checklist !== "object") return [];
  const keys = [
    "inserted",
    "duplicate_skipped",
    "moods",
    "aesthetic_tags",
    "mood_embedding",
    "aesthetic_embedding",
    "image_sourced",
    "poster_cached_storage",
    "trailer",
    "profile_scores",
    "catalog_visible",
    "released_at",
  ];
  return keys
    .filter((key) => checklist[key] !== undefined && checklist[key] !== null)
    .map((key) => ({ key, value: checklist[key] }));
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (value == null) return "—";
  return String(value);
}

export function FilmReleasesDashboard({ rows }: { rows: ReleaseQueueRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const readyFilmIds = useMemo(() => {
    return rows
      .filter(
        (row) =>
          row.film_id &&
          (row.result_status === "catalog_ready" ||
            row.result_status === "ranking_ready") &&
          row.film?.catalog_visible === false
      )
      .map((row) => row.film_id as string);
  }, [rows]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, on]) => on).map(([id]) => id),
    [selected]
  );

  function toggle(filmId: string) {
    setSelected((prev) => ({ ...prev, [filmId]: !prev[filmId] }));
  }

  function selectAllReady() {
    const next: Record<string, boolean> = {};
    for (const id of readyFilmIds) next[id] = true;
    setSelected(next);
  }

  async function processPrep() {
    setError(null);
    setMessage(null);
    const response = await fetch("/api/admin/film-releases/process-prep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_size: 5 }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Process prep failed");
      return;
    }
    setMessage(data.message ?? "Prep finished");
    startTransition(() => router.refresh());
  }

  async function goLive() {
    setError(null);
    setMessage(null);
    if (!selectedIds.length) {
      setError("Select at least one ready film");
      return;
    }
    const response = await fetch("/api/admin/film-releases/go-live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ film_ids: selectedIds }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Go live failed");
      return;
    }
    setMessage(
      `Released ${data.revealedCount ?? selectedIds.length} film(s); profile jobs=${data.profileJobs ?? "?"}`
    );
    setSelected({});
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={selectAllReady}
          className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Select all ready ({readyFilmIds.length})
        </button>
        <button
          type="button"
          onClick={goLive}
          disabled={pending || !selectedIds.length}
          className="rounded bg-black px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Go live selected ({selectedIds.length})
        </button>
        <button
          type="button"
          onClick={processPrep}
          disabled={pending}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          title="Recovery only — Approve normally starts prep automatically"
        >
          Retry pending prep
        </button>
      </div>
      <p className="text-sm text-gray-500">
        Prep starts automatically after Approve. Use Go live when a batch is
        ready. Retry pending prep is only for recovery.
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}

      <div className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No discovery release queue rows yet.</p>
        ) : (
          rows.map((row) => {
            const filmId = row.film_id;
            const canSelect =
              Boolean(filmId) &&
              row.film?.catalog_visible === false &&
              (row.result_status === "catalog_ready" ||
                row.result_status === "ranking_ready");
            return (
              <article
                key={row.id}
                className="rounded border border-gray-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium">
                      {row.title}{" "}
                      <span className="text-gray-500">({row.year})</span>
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      queue={row.status}
                      {row.result_status ? ` · ${row.result_status}` : ""}
                      {row.candidate?.release_status
                        ? ` · release=${row.candidate.release_status}`
                        : ""}
                      {row.film
                        ? ` · catalog_visible=${row.film.catalog_visible ? "true" : "false"}`
                        : ""}
                    </p>
                    {row.result_message ? (
                      <p className="mt-1 text-sm text-gray-500">{row.result_message}</p>
                    ) : null}
                    {row.candidate?.release_blockers?.length ? (
                      <p className="mt-1 text-sm text-amber-700">
                        blockers: {row.candidate.release_blockers.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  {canSelect && filmId ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[filmId])}
                        onChange={() => toggle(filmId)}
                      />
                      Select for go live
                    </label>
                  ) : null}
                </div>

                <ul className="mt-3 grid gap-1 text-sm text-gray-700 sm:grid-cols-2">
                  {checklistEntries(row.result_checklist).map((entry) => (
                    <li key={entry.key}>
                      <span className="text-gray-500">{entry.key}:</span>{" "}
                      {formatValue(entry.value)}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
