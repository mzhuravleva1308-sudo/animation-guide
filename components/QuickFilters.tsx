"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
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
  | "cultures"
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
  cultures: "Cultures",
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
  "cultures",
  "connection",
  "distance",
];

const THEME_FILTERS = ["sci-fi", "sarcasm", "cultures"] as const;
const THEME_FILTER_SET = new Set<QuickFilterOption>(THEME_FILTERS);
const MOOD_FILTERS = ["connection", "distance"] as const;
const MOOD_FILTER_SET = new Set<QuickFilterOption>(MOOD_FILTERS);
const FEATURED_FILTERS = new Set<QuickFilterOption>(["recent", "award-winners"]);

function isThemeFilter(
  filter: QuickFilter
): filter is (typeof THEME_FILTERS)[number] {
  return (
    filter === "sci-fi" || filter === "sarcasm" || filter === "cultures"
  );
}

function isMoodFilter(
  filter: QuickFilter
): filter is (typeof MOOD_FILTERS)[number] {
  return filter === "connection" || filter === "distance";
}

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

function useSplitFilterMenuPanel(open: boolean, label: string) {
  const panelRef = useRef<HTMLDivElement>(null);

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

  return panelRef;
}

function SplitFilterMenuPanel({
  open,
  onClose,
  menuId,
  ariaLabel,
  testId,
  panelRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  menuId: string;
  ariaLabel: string;
  testId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="fixed inset-0 z-20 cursor-default"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id={menuId}
        role="menu"
        aria-label={ariaLabel}
        data-testid={testId}
        className="absolute left-0 top-full z-30 mt-1.5 max-h-[min(20rem,calc(100dvh-7rem))] w-max min-w-[11.5rem] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-[#e4e6f0] bg-white py-1 shadow-lg"
      >
        {children}
      </div>
    </>
  );
}

function SplitFilterOption({
  label,
  isSelected,
  testId,
  onSelect,
}: {
  label: string;
  isSelected: boolean;
  testId: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isSelected}
      data-testid={testId}
      onClick={onSelect}
      className={`flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left font-sans text-[13px] font-normal leading-none tracking-tight antialiased sm:min-h-0 sm:py-1.5 [font-synthesis:none] ${
        isSelected
          ? "bg-[#eef0f8] text-[#1A1B2E]"
          : "text-[#4a4b5c] hover:bg-[#f6f7fb] hover:text-[#1A1B2E]"
      }`}
    >
      {label}
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
  const menuId = useId();
  const isTechniqueActive = isAnimationTechniqueFilter(activeFilter);
  const label = isTechniqueActive
    ? TECHNIQUE_LABELS[activeFilter]
    : TECHNIQUE_LABELS["stop-motion"];
  const panelRef = useSplitFilterMenuPanel(open, label);

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

      <SplitFilterMenuPanel
        open={open}
        onClose={() => setOpen(false)}
        menuId={menuId}
        ariaLabel="Animation techniques"
        testId="technique-filter-menu"
        panelRef={panelRef}
      >
        {ANIMATION_TECHNIQUE_FILTERS.map((option) => (
          <SplitFilterOption
            key={option.id}
            label={option.label}
            isSelected={activeFilter === option.id}
            testId={`technique-filter-option-${option.id}`}
            onSelect={() => {
              onFilterChange(option.id);
              setOpen(false);
            }}
          />
        ))}
      </SplitFilterMenuPanel>
    </div>
  );
}

function ThemeFilterControl({
  activeFilter,
  onFilterChange,
  availableThemes,
}: {
  activeFilter: QuickFilter;
  onFilterChange: (filter: QuickFilter) => void;
  availableThemes: Array<(typeof THEME_FILTERS)[number]>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const defaultTheme = availableThemes.includes("sci-fi")
    ? "sci-fi"
    : availableThemes[0];
  const isThemeActive =
    isThemeFilter(activeFilter) && availableThemes.includes(activeFilter);
  const label = isThemeActive
    ? FILTER_LABELS[activeFilter]
    : FILTER_LABELS[defaultTheme];
  const panelRef = useSplitFilterMenuPanel(open, label);

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

  if (!defaultTheme) {
    return null;
  }

  return (
    <div
      className={`relative inline-flex shrink-0 ${open ? "z-30" : ""}`}
      ref={menuRef}
      role="group"
      aria-label="Theme"
    >
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onFilterChange(isThemeActive ? null : defaultTheme);
        }}
        aria-pressed={isThemeActive}
        className={`relative z-30 inline-flex ${catalogChipHeightClass} items-center rounded-l-lg px-[9px] font-sans text-[13px] font-normal leading-none tracking-tight antialiased transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 [font-synthesis:none] ${splitChipTone(isThemeActive)}`}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label="Theme filters"
        data-testid="theme-filter-menu-trigger"
        className={`relative z-30 inline-flex ${catalogChipHeightClass} min-w-[28px] items-center justify-center rounded-r-lg border-l px-2 sm:min-w-0 sm:px-[6px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
          isThemeActive ? "border-white/25" : "border-[#d8dae8]"
        } ${splitChipTone(isThemeActive)}`}
      >
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`shrink-0 ${open ? "rotate-180" : ""} ${
            isThemeActive ? "text-white" : "text-[#5c5d6e]"
          }`}
          aria-hidden="true"
        />
      </button>

      <SplitFilterMenuPanel
        open={open}
        onClose={() => setOpen(false)}
        menuId={menuId}
        ariaLabel="Theme filters"
        testId="theme-filter-menu"
        panelRef={panelRef}
      >
        {availableThemes.map((option) => (
          <SplitFilterOption
            key={option}
            label={FILTER_LABELS[option]}
            isSelected={activeFilter === option}
            testId={`theme-filter-option-${option}`}
            onSelect={() => {
              onFilterChange(option);
              setOpen(false);
            }}
          />
        ))}
      </SplitFilterMenuPanel>
    </div>
  );
}

function MoodFilterControl({
  activeFilter,
  onFilterChange,
  availableMoods,
}: {
  activeFilter: QuickFilter;
  onFilterChange: (filter: QuickFilter) => void;
  availableMoods: Array<(typeof MOOD_FILTERS)[number]>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const defaultMood = availableMoods.includes("connection")
    ? "connection"
    : availableMoods[0];
  const isMoodActive = isMoodFilter(activeFilter) && availableMoods.includes(activeFilter);
  const label = isMoodActive
    ? FILTER_LABELS[activeFilter]
    : FILTER_LABELS[defaultMood];
  const panelRef = useSplitFilterMenuPanel(open, label);

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

  if (!defaultMood) {
    return null;
  }

  return (
    <div
      className={`relative inline-flex shrink-0 ${open ? "z-30" : ""}`}
      ref={menuRef}
      role="group"
      aria-label="Mood"
    >
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onFilterChange(isMoodActive ? null : defaultMood);
        }}
        aria-pressed={isMoodActive}
        className={`relative z-30 inline-flex ${catalogChipHeightClass} items-center rounded-l-lg px-[9px] font-sans text-[13px] font-normal leading-none tracking-tight antialiased transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 [font-synthesis:none] ${splitChipTone(isMoodActive)}`}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label="Mood filters"
        data-testid="mood-filter-menu-trigger"
        className={`relative z-30 inline-flex ${catalogChipHeightClass} min-w-[28px] items-center justify-center rounded-r-lg border-l px-2 sm:min-w-0 sm:px-[6px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
          isMoodActive ? "border-white/25" : "border-[#d8dae8]"
        } ${splitChipTone(isMoodActive)}`}
      >
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`shrink-0 ${open ? "rotate-180" : ""} ${
            isMoodActive ? "text-white" : "text-[#5c5d6e]"
          }`}
          aria-hidden="true"
        />
      </button>

      <SplitFilterMenuPanel
        open={open}
        onClose={() => setOpen(false)}
        menuId={menuId}
        ariaLabel="Mood filters"
        testId="mood-filter-menu"
        panelRef={panelRef}
      >
        {availableMoods.map((option) => (
          <SplitFilterOption
            key={option}
            label={FILTER_LABELS[option]}
            isSelected={activeFilter === option}
            testId={`mood-filter-option-${option}`}
            onSelect={() => {
              onFilterChange(option);
              setOpen(false);
            }}
          />
        ))}
      </SplitFilterMenuPanel>
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
    (option) =>
      !THEME_FILTER_SET.has(option) &&
      !MOOD_FILTER_SET.has(option) &&
      !FEATURED_FILTERS.has(option)
  );
  const themeOptions = THEME_FILTERS.filter((option) =>
    availableFilters.includes(option)
  );
  const moodOptions = MOOD_FILTERS.filter((option) =>
    availableFilters.includes(option)
  );
  const showFeaturedDivider = featuredOptions.length > 0 && primaryOptions.length > 0;
  const showTechniquePicker = availableFilters.includes("stop-motion");
  const showThemePicker = themeOptions.length > 0;
  const showMoodPicker = moodOptions.length > 0;

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

      {showThemePicker ? (
        <ThemeFilterControl
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
          availableThemes={themeOptions}
        />
      ) : null}

      {showMoodPicker ? (
        <MoodFilterControl
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
          availableMoods={moodOptions}
        />
      ) : null}
    </div>
  );
}
