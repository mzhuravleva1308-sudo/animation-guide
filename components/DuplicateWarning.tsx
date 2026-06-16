"use client";

import type { DuplicateMatch } from "@/lib/film-duplicate-check";

type DuplicateWarningProps = {
  matches: DuplicateMatch[];
  incomingTitle: string;
  reason: "hard_duplicate" | "possible_duplicate";
  allowPossibleDuplicates: boolean;
  forceExactDuplicate: boolean;
  onAllowPossibleDuplicatesChange: (value: boolean) => void;
  onForceExactDuplicateChange: (value: boolean) => void;
};

export function DuplicateWarning({
  matches,
  incomingTitle,
  reason,
  allowPossibleDuplicates,
  forceExactDuplicate,
  onAllowPossibleDuplicatesChange,
  onForceExactDuplicateChange,
}: DuplicateWarningProps) {
  const isHardDuplicate = reason === "hard_duplicate";

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <h3 className="font-semibold">
        {isHardDuplicate ? "Exact duplicate detected" : "Possible duplicate detected"}
      </h3>
      <p className="mt-2 text-sm">
        Import blocked for <span className="font-medium">{incomingTitle}</span>.
        Review the existing film before saving.
      </p>

      <ul className="mt-4 grid gap-3">
        {matches.map((match) => {
          const existing = match.existingFilm;

          return (
            <li
              key={existing.id ?? `${existing.title}-${existing.year ?? "unknown"}`}
              className="rounded-lg border border-amber-200 bg-white p-3 text-sm"
            >
              <div className="font-medium">{existing.title}</div>
              <div className="mt-1 text-amber-900">
                {[
                  existing.year ? `Year ${existing.year}` : null,
                  existing.director ? `Director ${existing.director}` : null,
                  existing.country ? existing.country : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="mt-2 text-xs text-amber-800">
                Score {Math.round(match.score)} · {match.reasons.join(" · ")}
              </div>
            </li>
          );
        })}
      </ul>

      {!isHardDuplicate ? (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowPossibleDuplicates}
            onChange={(event) =>
              onAllowPossibleDuplicatesChange(event.target.checked)
            }
            className="mt-1"
          />
          <span>Save anyway (allow possible duplicate)</span>
        </label>
      ) : (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={forceExactDuplicate}
            onChange={(event) => onForceExactDuplicateChange(event.target.checked)}
            className="mt-1"
          />
          <span>Force insert exact duplicate (override hard block)</span>
        </label>
      )}
    </div>
  );
}
