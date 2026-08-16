"use client";

import { CalendarClock, Trophy } from "lucide-react";
import { catalogChipHeightClass } from "@/lib/catalog-control-size";

export type QuickFilter =
  | "recent"
  | "stop-motion"
  | "landscapes"
  | "award-winners"
  | "sci-fi"
  | "sarcasm"
  | "connection"
  | "distance"
  | null;

export type QuickFilterOption = Exclude<QuickFilter, null>;

type QuickFiltersProps = {
  activeFilter: QuickFilter;
  onFilterChange: (filter: QuickFilter) => void;
  availableFilters?: QuickFilterOption[];
};

const FILTER_LABELS: Record<QuickFilterOption, string> = {
  recent: "Recent",
  "award-winners": "Award winners",
  "stop-motion": "Stop motion",
  landscapes: "Landscapes",
  "sci-fi": "Sci-Fi",
  sarcasm: "Sarcasm",
  connection: "Light",
  distance: "Shadow",
};

const DEFAULT_FILTERS: QuickFilterOption[] = [
  "recent",
  "award-winners",
  "stop-motion",
  "sci-fi",
  "sarcasm",
  "connection",
  "distance",
];

const MOOD_FILTERS = new Set<QuickFilterOption>(["connection", "distance"]);
const FEATURED_FILTERS = new Set<QuickFilterOption>(["recent", "award-winners"]);

function FilterDivider() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 hidden h-3 w-px shrink-0 bg-[#d0d3e6] sm:block"
    />
  );
}

function filterChipClass(isActive: boolean) {
  return `inline-flex ${catalogChipHeightClass} shrink-0 items-center gap-[4.5px] rounded-lg px-[9px] font-sans text-[13px] font-normal leading-none tracking-tight antialiased transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 [font-synthesis:none] ${
    isActive
      ? "bg-[#5b5f8a] text-white shadow-sm"
      : "bg-[#eef0f8] text-[#5c5d6e] hover:bg-[#e5e7f4] hover:text-[#1A1B2E]"
  }`;
}

function FilterChip({
  option,
  isActive,
  onClick,
}: {
  option: QuickFilterOption;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={filterChipClass(isActive)}
    >
      {option === "award-winners" ? (
        <>
          <Trophy
            size={11}
            strokeWidth={2}
            className={`shrink-0 ${isActive ? "text-white" : "text-[#5c5d6e]"}`}
            aria-hidden="true"
          />
          <span className="sm:hidden">Winners</span>
          <span className="hidden sm:inline">Award winners</span>
        </>
      ) : option === "recent" ? (
        <>
          <CalendarClock
            size={11}
            strokeWidth={2}
            className={`shrink-0 ${isActive ? "text-white" : "text-[#5c5d6e]"}`}
            aria-hidden="true"
          />
          {FILTER_LABELS[option]}
        </>
      ) : (
        FILTER_LABELS[option]
      )}
    </button>
  );
}

export default function QuickFilters({
  activeFilter,
  onFilterChange,
  availableFilters = DEFAULT_FILTERS,
}: QuickFiltersProps) {
  const featuredOptions = availableFilters.filter((option) =>
    FEATURED_FILTERS.has(option)
  );
  const primaryOptions = availableFilters.filter(
    (option) => !MOOD_FILTERS.has(option) && !FEATURED_FILTERS.has(option)
  );
  const moodOptions = availableFilters.filter((option) => MOOD_FILTERS.has(option));
  const showFeaturedDivider = featuredOptions.length > 0 && primaryOptions.length > 0;

  return (
    <div
      className="contents"
      role="group"
      aria-label="Quick filters"
    >
      {featuredOptions.map((option) => {
        const isActive = activeFilter === option;

        return (
          <FilterChip
            key={option}
            option={option}
            isActive={isActive}
            onClick={() => onFilterChange(isActive ? null : option)}
          />
        );
      })}

      {showFeaturedDivider ? <FilterDivider /> : null}

      {primaryOptions.map((option) => {
        const isActive = activeFilter === option;

        return (
          <FilterChip
            key={option}
            option={option}
            isActive={isActive}
            onClick={() => onFilterChange(isActive ? null : option)}
          />
        );
      })}

      {moodOptions.map((option) => {
        const isActive = activeFilter === option;

        return (
          <FilterChip
            key={option}
            option={option}
            isActive={isActive}
            onClick={() => onFilterChange(isActive ? null : option)}
          />
        );
      })}
    </div>
  );
}
