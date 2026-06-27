"use client";

export type QuickFilter =
  | "recent"
  | "stop-motion"
  | "award-winners"
  | null;

type QuickFiltersProps = {
  activeFilter: QuickFilter;
  onFilterChange: (filter: QuickFilter) => void;
};

export default function QuickFilters({
  activeFilter,
  onFilterChange,
}: QuickFiltersProps) {
  const isRecentActive = activeFilter === "recent";
  const isStopMotionActive = activeFilter === "stop-motion";
  const isAwardWinnersActive = activeFilter === "award-winners";
  const isAllActive = activeFilter === null;

  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        onClick={() => onFilterChange(null)}
        aria-pressed={isAllActive}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          isAllActive
            ? "border-stone-800 bg-stone-800 text-white"
            : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
        }`}
      >
        All
      </button>
<button
        type="button"
        onClick={() => onFilterChange(isRecentActive ? null : "recent")}
        aria-pressed={isRecentActive}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          isRecentActive
            ? "border-stone-800 bg-stone-800 text-white"
            : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
        }`}
      >
        Recent
      </button>
      <button
        type="button"
        onClick={() =>
          onFilterChange(isAwardWinnersActive ? null : "award-winners")
        }
        aria-pressed={isAwardWinnersActive}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          isAwardWinnersActive
            ? "border-stone-800 bg-stone-800 text-white"
            : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
        }`}
      >
        Award winners
      </button>
      <button
        type="button"
        onClick={() =>
          onFilterChange(isStopMotionActive ? null : "stop-motion")
        }
        aria-pressed={isStopMotionActive}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          isStopMotionActive
            ? "border-stone-800 bg-stone-800 text-white"
            : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
        }`}
      >
        Stop motion
      </button>
    </div>
  );
}