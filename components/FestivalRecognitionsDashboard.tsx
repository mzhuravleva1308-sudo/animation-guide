"use client";

import { useState } from "react";

type SummaryEntry = {
  label: string;
  count: number;
};

type FilmRef = {
  id: string;
  title: string;
  year: number | null;
};

type ClaimRow = {
  id: string;
  film_id: string;
  raw_festival_name: string;
  canonical_festival_id: string | null;
  festival_year: number | null;
  section: string | null;
  recognition_type: string;
  award_name: string | null;
  source_type: string;
  source_url: string | null;
  original_text: string | null;
  claim_status: string;
  verification_reason: string | null;
  official_url: string | null;
  discovery_source: string | null;
  film: FilmRef | null;
};

type RecognitionRow = {
  id: string;
  film_id: string;
  festival_name: string;
  festival_year: number | null;
  section: string | null;
  recognition_type: string;
  award_name: string | null;
  award_result: string | null;
  source_url: string | null;
  source_label: string | null;
  source_type: string | null;
  confidence_status: string | null;
  import_source: string | null;
  film: FilmRef | null;
};

type ClaimSummary = {
  totalClaims: number;
  uniqueFilms: number;
  byStatus: SummaryEntry[];
  bySourceType: SummaryEntry[];
  byFestival?: SummaryEntry[];
};

type RecognitionSummary = {
  totalRows: number;
  uniqueFilms: number;
  byFestival: SummaryEntry[];
  byImportSource: SummaryEntry[];
  byRecognitionType: SummaryEntry[];
};

type ClaimsPanelProps = {
  title: string;
  description: string;
  emptyMessage: string;
  claims: { rows: ClaimRow[]; summary: ClaimSummary };
};

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-gray-400">{detail}</p> : null}
    </div>
  );
}

function CountList({
  title,
  entries,
}: {
  title: string;
  entries: SummaryEntry[];
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-medium text-gray-900">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No data yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-gray-700">{entry.label}</span>
              <span className="font-medium tabular-nums text-gray-900">
                {entry.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatFilmLabel(film: FilmRef | null) {
  if (!film) {
    return "Unknown film";
  }

  return film.year ? `${film.title} (${film.year})` : film.title;
}

function formatClaimStatus(status: string) {
  const labels: Record<string, string> = {
    possibly_at_festival: "possibly at festival",
    confirmed_presence: "confirmed presence",
    confirmed: "confirmed presence",
    enriched: "enriched (official details)",
    discovered_unverified: "discovered (legacy)",
    not_at_festival: "not at festival (official check)",
  };

  return labels[status] ?? status.replace(/_/g, " ");
}

function ClaimsTable({ rows, emptyMessage }: { rows: ClaimRow[]; emptyMessage: string }) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Film</th>
            <th className="px-4 py-3">Festival</th>
            <th className="px-4 py-3">Year</th>
            <th className="px-4 py-3">Section / award</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-4 py-3 font-medium text-gray-900">
                {formatFilmLabel(row.film)}
              </td>
              <td className="px-4 py-3 text-gray-700">
                {row.raw_festival_name}
                {row.canonical_festival_id ? (
                  <span className="mt-1 block text-xs text-gray-400">
                    {row.canonical_festival_id}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 tabular-nums text-gray-700">
                {row.festival_year ?? "—"}
              </td>
              <td className="px-4 py-3 text-gray-700">
                {row.section ?? "—"}
                <span className="mt-1 block text-xs text-gray-400">
                  {row.award_name
                    ? `${row.award_name} (${row.recognition_type})`
                    : row.recognition_type}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700">
                <span className="block">{row.source_type}</span>
                {row.discovery_source ? (
                  <span className="mt-1 block text-xs text-gray-400">
                    {row.discovery_source}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-gray-700">
                {formatClaimStatus(row.claim_status)}
              </td>
              <td className="max-w-sm px-4 py-3 text-gray-600">
                {row.original_text ?? row.verification_reason ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecognitionsTable({ rows }: { rows: RecognitionRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
        No confirmed Annecy recognitions yet. Run the verification pass after discovery.
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Film</th>
            <th className="px-4 py-3">Year</th>
            <th className="px-4 py-3">Section</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Award</th>
            <th className="px-4 py-3">Official source</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-4 py-3 font-medium text-gray-900">
                {formatFilmLabel(row.film)}
              </td>
              <td className="px-4 py-3 tabular-nums text-gray-700">
                {row.festival_year ?? "—"}
              </td>
              <td className="px-4 py-3 text-gray-700">{row.section ?? "—"}</td>
              <td className="px-4 py-3 text-gray-700">{row.recognition_type}</td>
              <td className="px-4 py-3 text-gray-700">
                {row.award_name ?? "—"}
                {row.award_result ? (
                  <span className="mt-1 block text-xs text-gray-400">
                    {row.award_result}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-gray-700">
                {row.source_url ? (
                  <a
                    href={row.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-blue-600 hover:underline"
                  >
                    {row.source_label ?? row.source_url}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-gray-700">
                {row.confidence_status ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClaimsPanel({ title, description, emptyMessage, claims }: ClaimsPanelProps) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Candidate claims" value={claims.summary.totalClaims} />
        <SummaryCard label="Films with claims" value={claims.summary.uniqueFilms} />
        <SummaryCard label="Claim statuses" value={claims.summary.byStatus.length} />
        <SummaryCard label="Source types" value={claims.summary.bySourceType.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CountList title="By claim status" entries={claims.summary.byStatus} />
        <CountList title="By source type" entries={claims.summary.bySourceType} />
        <CountList title="By festival" entries={claims.summary.byFestival ?? []} />
      </div>

      <section>
        <h2 className="text-lg font-medium text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
        <ClaimsTable rows={claims.rows} emptyMessage={emptyMessage} />
      </section>
    </>
  );
}

export function FestivalRecognitionsDashboard({
  allClaims,
  annecyClaims,
  confirmedAnnecyPresence,
  recognitions,
}: {
  allClaims: { rows: ClaimRow[]; summary: ClaimSummary };
  annecyClaims: { rows: ClaimRow[]; summary: ClaimSummary };
  confirmedAnnecyPresence: { rows: ClaimRow[]; summary: ClaimSummary };
  recognitions: { rows: RecognitionRow[]; summary: RecognitionSummary };
}) {
  const [activeTab, setActiveTab] = useState<"all" | "annecy" | "confirmed">("all");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === "all"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          All candidates ({allClaims.summary.totalClaims})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("annecy")}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === "annecy"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Annecy candidates ({annecyClaims.summary.totalClaims})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("confirmed")}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === "confirmed"
              ? "border-black text-black"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          Confirmed Annecy ({confirmedAnnecyPresence.summary.uniqueFilms})
        </button>
      </div>

      {activeTab === "all" ? (
        <ClaimsPanel
          title="All festival candidates"
          description="Unverified discovery claims from AI inference and catalog fields. Nothing here is confirmed until verification."
          emptyMessage="No festival claims yet. Run scripts/ai-festival-discovery.mjs on hosted."
          claims={allClaims}
        />
      ) : null}

      {activeTab === "annecy" ? (
        <ClaimsPanel
          title="Annecy candidates"
          description="Subset of discovery claims where canonical_festival_id = annecy."
          emptyMessage="No Annecy claims yet."
          claims={annecyClaims}
        />
      ) : null}

      {activeTab === "confirmed" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Confirmed films"
              value={confirmedAnnecyPresence.summary.uniqueFilms}
            />
            <SummaryCard
              label="With official URL"
              value={
                confirmedAnnecyPresence.rows.filter((row) => row.official_url)
                  .length
              }
            />
            <SummaryCard
              label="Detail rows (tier 3)"
              value={recognitions.summary.totalRows}
              detail="film_festival_recognitions"
            />
            <SummaryCard
              label="Festival years"
              value={
                new Set(
                  confirmedAnnecyPresence.rows
                    .map((row) => row.festival_year)
                    .filter(Boolean)
                ).size
              }
            />
          </div>

          <section className="mt-6">
            <h2 className="text-lg font-medium text-gray-900">
              Confirmed Annecy presence
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Tier 2: official archive confirmed the film appeared at Annecy
              (stored in film_festival_claims). Award/section detail rows appear
              below when tier 3 enrichment runs.
            </p>
            <ClaimsTable
              rows={confirmedAnnecyPresence.rows}
              emptyMessage="No confirmed Annecy presence yet. Run verification after discovery."
            />
          </section>

          {recognitions.rows.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-lg font-medium text-gray-900">
                Enriched recognitions (tier 3)
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Rows in film_festival_recognitions with confirmed_official
                status.
              </p>
              <RecognitionsTable rows={recognitions.rows} />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
