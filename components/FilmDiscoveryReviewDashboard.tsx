"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
};

function asUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function FilmDiscoveryReviewDashboard({
  candidates,
}: {
  candidates: DiscoveryCandidateRow[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({});
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
          Approve marks an approved candidate only — it does not publish, enrich,
          or show the film in the public catalog.
        </p>

        {pending.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No candidates awaiting review.</p>
        ) : (
          <ul className="mt-6 space-y-6">
            {pending.map((film) => (
              <li
                key={film.id}
                className="border-t border-gray-200 pt-6"
                data-testid="discovery-candidate"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-medium">
                      {film.title}{" "}
                      <span className="text-gray-500">({film.year})</span>
                    </h3>
                    <p className="text-sm text-gray-600">
                      Original: {film.original_title ?? "—"} ·{" "}
                      {(film.directors ?? []).join(", ") || "—"} ·{" "}
                      {(film.countries ?? []).join(", ") || "—"} ·{" "}
                      {film.runtime_minutes ?? "—"} min
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-wide text-gray-500">
                      source: {film.source} · eligibility:{" "}
                      {film.eligibility_result ?? "n/a"}
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
              </li>
            ))}
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
                {film.reject_reason ? ` · ${film.reject_reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
