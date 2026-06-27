"use client";

export type QuickFilter =
  | "recent"
  | "stop-motion"
  | "award-winners"
  | "sci-fi"
  | null;

export type QuickFilterOption =
  | "all"
  | "recent"
  | "award-winners"
  | "stop-motion"
  | "sci-fi";

type QuickFiltersProps = {
  activeFilter: QuickFilter;
  onFilterChange: (filter: QuickFilter) => void;
  availableFilters?: QuickFilterOption[];
};

const FILTER_LABELS: Record<QuickFilterOption, string> = {
  all: "All",
  recent: "Recent",
  "award-winners": "Award winners",
  "stop-motion": "Stop motion",
  "sci-fi": "Sci-Fi",
};

function optionToFilter(option: QuickFilterOption): QuickFilter {
  return option === "all" ? null : option;
}

export default function QuickFilters({
  activeFilter,
  onFilterChange,
  availableFilters = ["all", "recent", "award-winners", "stop-motion", "sci-fi"],
}: QuickFiltersProps) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {availableFilters.map((option) => {
        const filter = optionToFilter(option);
        const isActive = activeFilter === filter;

        return (
          <button
            key={option}
            type="button"
            onClick={() => onFilterChange(isActive ? null : filter)}
            aria-pressed={isActive}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? "border-stone-800 bg-stone-800 text-white"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
            }`}
          >
            {FILTER_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}