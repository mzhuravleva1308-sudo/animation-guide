"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarClock, Check, ChevronDown, Trophy } from "lucide-react";
import {
  ANIMATION_TECHNIQUE_FILTERS,
  isAnimationTechniqueFilter,
} from "@/lib/animation-technique-filters.mjs";
import { catalogChipHeightClass } from "@/lib/catalog-control-size";

export type AnimationTechniqueFilter =
  (typeof ANIMATION_TECHNIQUE_FILTERS)[number]["id"];

export type QuickFilter =
  | "recent"
  | AnimationTechniqueFilter
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

const TECHNIQUE_LABELS = Object.fromEntries(
  ANIMATION_TECHNIQUE_FILTERS.map((row) => [row.id, row.label])
) as Record<AnimationTechniqueFilter, string>;

const FILTER_LABELS: Record<QuickFilterOption, string> = {
  recent: "Recent",
  "award-winners": "Award winners",
  landscapes: "Landscapes",
  "sci-fi": "Sci-Fi",
  sarcasm: "Sarcasm",
  connection: "Light",
  distance: "Shadow",
  ...TECHNIQUE_LABELS,
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

function splitChipTone(isActive: boolean) {
  return isActive
    ? "bg-[#5b5f8a] text-white shadow-sm"
    : "bg-[#eef0f8] text-[#5c5d6e] hover:bg-[#e5e7f4] hover:text-[#1A1B2E]";
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

function TechniqueFilterControl({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: QuickFilter;
  onFilterChange: (filter: QuickFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isTechniqueActive = isAnimationTechniqueFilter(activeFilter);
  const label = isTechniqueActive
    ? TECHNIQUE_LABELS[activeFilter]
    : TECHNIQUE_LABELS["stop-motion"];

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) {
      return;
    }

    panel.style.transform = "";
    const rect = panel.getBoundingClientRect();
    const padding = 16;
    const overflowX = rect.right - (window.innerWidth - padding);
    if (overflowX > 0) {
      panel.style.transform = `translateX(-${Math.ceil(overflowX)}px)`;
    }
  }, [open, label]);

  return (
    <div
      className={`relative inline-flex shrink-0 ${open ? "z-30" : ""}`}
      ref={menuRef}
      role="group"
      aria-label="Animation technique"
    >
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onFilterChange(isTechniqueActive ? null : "stop-motion");
        }}
        aria-pressed={isTechniqueActive}
        className={`relative z-30 inline-flex ${catalogChipHeightClass} items-center rounded-l-lg px-[9px] font-sans text-[13px] font-normal leading-none tracking-tight antialiased transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 [font-synthesis:none] ${splitChipTone(isTechniqueActive)}`}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label="Animation techniques"
        data-testid="technique-filter-menu-trigger"
        className={`relative z-30 inline-flex ${catalogChipHeightClass} min-w-[28px] items-center justify-center rounded-r-lg border-l px-2 sm:min-w-0 sm:px-[6px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
          isTechniqueActive ? "border-white/25" : "border-[#d8dae8]"
        } ${splitChipTone(isTechniqueActive)}`}
      >
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`shrink-0 ${open ? "rotate-180" : ""} ${
            isTechniqueActive ? "text-white" : "text-[#5c5d6e]"
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label="Animation techniques"
            data-testid="technique-filter-menu"
            className="absolute left-0 top-full z-30 mt-1.5 max-h-[min(20rem,calc(100dvh-7rem))] w-max min-w-[11.5rem] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-[#e4e6f0] bg-white py-1 shadow-lg"
          >
            {ANIMATION_TECHNIQUE_FILTERS.map((option) => {
              const isSelected = activeFilter === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  data-testid={`technique-filter-option-${option.id}`}
                  onClick={() => {
                    onFilterChange(option.id);
                    setOpen(false);
                  }}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left font-sans text-[13px] font-normal leading-none tracking-tight antialiased sm:min-h-0 sm:py-1.5 [font-synthesis:none] ${
                    isSelected
                      ? "bg-[#eef0f8] text-[#1A1B2E]"
                      : "text-[#4a4b5c] hover:bg-[#f6f7fb] hover:text-[#1A1B2E]"
                  }`}
                >
                  {option.label}
                  {isSelected ? (
                    <Check
                      size={12}
                      strokeWidth={2}
                      className="shrink-0 text-[#5b5f8a]"
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="w-3 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
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
  const showTechniquePicker = availableFilters.includes("stop-motion");

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
        if (option === "stop-motion" && showTechniquePicker) {
          return (
            <TechniqueFilterControl
              key={option}
              activeFilter={activeFilter}
              onFilterChange={onFilterChange}
            />
          );
        }

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
