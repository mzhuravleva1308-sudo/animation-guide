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
import {
  CalendarClock,
  Check,
  ChevronDown,
  Film as FilmIcon,
  Rocket,
  Sun,
  Trophy,
} from "lucide-react";
import {
  ANIMATION_TECHNIQUE_FILTERS,
  isAnimationTechniqueFilter,
} from "@/lib/animation-technique-filters.mjs";
import {
  AWARD_FESTIVAL_FILTERS,
  isAwardFestivalFilter,
} from "@/lib/award-festival-filters.mjs";
import { catalogChipHeightClass } from "@/lib/catalog-control-size";

export type AnimationTechniqueFilter =
  (typeof ANIMATION_TECHNIQUE_FILTERS)[number]["id"];

export type AwardFestivalFilter =
  (typeof AWARD_FESTIVAL_FILTERS)[number]["id"];

export type AwardFestivalFilterOption = {
  id: AwardFestivalFilter;
  label: string;
  description: string;
};

export type QuickFilter =
  | "recent"
  | AnimationTechniqueFilter
  | AwardFestivalFilter
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
  /** Festivals with enough catalog films; empty hides the Award winners menu. */
  availableAwardFestivals?: AwardFestivalFilterOption[];
};

const TECHNIQUE_LABELS = Object.fromEntries(
  ANIMATION_TECHNIQUE_FILTERS.map((row) => [row.id, row.label])
) as Record<AnimationTechniqueFilter, string>;

const FESTIVAL_LABELS = Object.fromEntries(
  AWARD_FESTIVAL_FILTERS.map((row) => [row.id, row.label])
) as Record<AwardFestivalFilter, string>;

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
  ...FESTIVAL_LABELS,
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
  return `inline-flex ${catalogChipHeightClass} shrink-0 items-center gap-[4.5px] rounded-[14px] border px-[9px] font-sans text-[13px] leading-none tracking-tight antialiased backdrop-blur-[14px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 [font-synthesis:none] ${
    isActive
      ? "border-[rgba(177,169,217,0.75)] bg-[#efeaf8] font-medium text-[#4a3f7a]"
      : "border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.65)] font-normal text-[#5c5d6e] hover:border-[rgba(177,169,217,0.48)] hover:bg-[rgba(255,255,255,0.8)] hover:text-[#1A1B2E]"
  }`;
}

function splitShellClass(isActive: boolean, open: boolean) {
  const tone = open
    ? isActive
      ? "border-[rgba(177,169,217,0.85)] bg-[#efeaf8] text-[#4a3f7a]"
      : "border-[rgba(177,169,217,0.65)] bg-[rgba(255,255,255,0.82)] text-[#4a4b5c]"
    : isActive
      ? "border-[rgba(177,169,217,0.75)] bg-[#efeaf8] text-[#4a3f7a]"
      : "border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.65)] text-[#4a4b5c] hover:bg-[rgba(255,255,255,0.8)]";
  return `relative inline-flex ${catalogChipHeightClass} items-stretch overflow-hidden rounded-[14px] border backdrop-blur-[14px] transition-[background-color,border-color,color] duration-150 ${tone}`;
}

function splitApplyBtnClass(isActive: boolean) {
  return `inline-flex h-full items-center gap-[4.5px] px-[9px] font-sans text-[13px] leading-none tracking-tight antialiased transition-colors [font-synthesis:none] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900 ${
    isActive
      ? "font-medium text-[#4a3f7a] hover:text-[#3a3266]"
      : "font-normal text-[#4a4b5c] hover:text-[#2f3040]"
  }`;
}

function splitChevronBtnClass(isActive: boolean) {
  return `inline-flex h-full min-w-[28px] items-center justify-center px-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900 sm:min-w-0 sm:px-[6px] ${
    isActive
      ? "text-[#6b5ea8] hover:text-[#4a3f7a]"
      : "text-[#6b6c80] hover:text-[#2f3040]"
  }`;
}

function filterIconClass(isActive: boolean) {
  return `shrink-0 ${isActive ? "text-[#6b5ea8]" : "text-[#6b6c80]"}`;
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
            className={filterIconClass(isActive)}
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
            className={filterIconClass(isActive)}
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
  rootRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  menuId: string;
  ariaLabel: string;
  testId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  /** Chip + menu root — clicks outside this close the menu. */
  rootRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    // Capture so we still close when a card/poster sits above any local overlay.
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
    };
  }, [open, onClose, rootRef]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      id={menuId}
      role="menu"
      aria-label={ariaLabel}
      data-testid={testId}
      className="absolute left-0 top-full z-50 mt-2 max-h-[min(20rem,calc(100dvh-7rem))] w-max min-w-[11.5rem] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-[14px] border border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.72)] py-1.5 shadow-[0_8px_28px_rgba(35,36,61,0.1)] backdrop-blur-[14px]"
    >
      {children}
    </div>
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
          ? "bg-[rgba(177,169,217,0.22)] text-[#2f3040]"
          : "text-[#4a4b5c] hover:bg-[rgba(255,255,255,0.55)] hover:text-[#2f3040]"
      }`}
    >
      {label}
      {isSelected ? (
        <Check
          size={12}
          strokeWidth={2}
          className="shrink-0 text-[#6b5ea8]"
          aria-hidden="true"
        />
      ) : (
        <span className="w-3 shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}

function AwardWinnersFilterControl({
  activeFilter,
  onFilterChange,
  availableFestivals,
}: {
  activeFilter: QuickFilter;
  onFilterChange: (filter: QuickFilter) => void;
  availableFestivals: AwardFestivalFilterOption[];
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isFestivalActive =
    isAwardFestivalFilter(activeFilter) &&
    availableFestivals.some((row) => row.id === activeFilter);
  const isAwardActive = activeFilter === "award-winners" || isFestivalActive;
  const label = isFestivalActive
    ? FESTIVAL_LABELS[activeFilter]
    : FILTER_LABELS["award-winners"];
  const panelRef = useSplitFilterMenuPanel(open, label);
  const showMobileShortLabel = !isFestivalActive;

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
      className={`relative inline-flex shrink-0 ${open ? "z-50" : ""}`}
      ref={menuRef}
      role="group"
      aria-label="Award winners and festivals"
    >
      <div className={splitShellClass(isAwardActive, open)}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onFilterChange(isAwardActive ? null : "award-winners");
          }}
          aria-pressed={isAwardActive}
          className={splitApplyBtnClass(isAwardActive)}
        >
          {!isFestivalActive ? (
            <Trophy
              size={11}
              strokeWidth={2}
              className={filterIconClass(isAwardActive)}
              aria-hidden="true"
            />
          ) : null}
          {showMobileShortLabel ? (
            <>
              <span className="sm:hidden">Winners</span>
              <span className="hidden sm:inline">{label}</span>
            </>
          ) : (
            label
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label="Award winners and festivals"
          data-testid="award-filter-menu-trigger"
          className={splitChevronBtnClass(isAwardActive)}
        >
          <ChevronDown
            size={12}
            strokeWidth={2}
            className={`shrink-0 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      <SplitFilterMenuPanel
        open={open}
        onClose={() => setOpen(false)}
        menuId={menuId}
        ariaLabel="Award winners and festivals"
        testId="award-filter-menu"
        panelRef={panelRef}
        rootRef={menuRef}
      >
        <SplitFilterOption
          label={FILTER_LABELS["award-winners"]}
          isSelected={activeFilter === "award-winners"}
          testId="award-filter-option-award-winners"
          onSelect={() => {
            onFilterChange("award-winners");
            setOpen(false);
          }}
        />
        {availableFestivals.map((option) => (
          <SplitFilterOption
            key={option.id}
            label={option.label}
            isSelected={activeFilter === option.id}
            testId={`award-filter-option-${option.id}`}
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
  const showDefaultIcon = !isTechniqueActive || activeFilter === "stop-motion";
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
      className={`relative inline-flex shrink-0 ${open ? "z-50" : ""}`}
      ref={menuRef}
      role="group"
      aria-label="Animation technique"
    >
      <div className={splitShellClass(isTechniqueActive, open)}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onFilterChange(isTechniqueActive ? null : "stop-motion");
          }}
          aria-pressed={isTechniqueActive}
          className={splitApplyBtnClass(isTechniqueActive)}
        >
          {showDefaultIcon ? (
            <FilmIcon
              size={11}
              strokeWidth={2}
              className={filterIconClass(isTechniqueActive)}
              aria-hidden="true"
            />
          ) : null}
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
          className={splitChevronBtnClass(isTechniqueActive)}
        >
          <ChevronDown
            size={12}
            strokeWidth={2}
            className={`shrink-0 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      <SplitFilterMenuPanel
        open={open}
        onClose={() => setOpen(false)}
        menuId={menuId}
        ariaLabel="Animation techniques"
        testId="technique-filter-menu"
        panelRef={panelRef}
        rootRef={menuRef}
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
  const showDefaultIcon = !isThemeActive || activeFilter === defaultTheme;
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
      className={`relative inline-flex shrink-0 ${open ? "z-50" : ""}`}
      ref={menuRef}
      role="group"
      aria-label="Theme"
    >
      <div className={splitShellClass(isThemeActive, open)}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onFilterChange(isThemeActive ? null : defaultTheme);
          }}
          aria-pressed={isThemeActive}
          className={splitApplyBtnClass(isThemeActive)}
        >
          {showDefaultIcon ? (
            <Rocket
              size={11}
              strokeWidth={2}
              className={filterIconClass(isThemeActive)}
              aria-hidden="true"
            />
          ) : null}
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
          className={splitChevronBtnClass(isThemeActive)}
        >
          <ChevronDown
            size={12}
            strokeWidth={2}
            className={`shrink-0 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      <SplitFilterMenuPanel
        open={open}
        onClose={() => setOpen(false)}
        menuId={menuId}
        ariaLabel="Theme filters"
        testId="theme-filter-menu"
        panelRef={panelRef}
        rootRef={menuRef}
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
  const showDefaultIcon = !isMoodActive || activeFilter === defaultMood;
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
      className={`relative inline-flex shrink-0 ${open ? "z-50" : ""}`}
      ref={menuRef}
      role="group"
      aria-label="Mood"
    >
      <div className={splitShellClass(isMoodActive, open)}>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onFilterChange(isMoodActive ? null : defaultMood);
          }}
          aria-pressed={isMoodActive}
          className={splitApplyBtnClass(isMoodActive)}
        >
          {showDefaultIcon ? (
            <Sun
              size={11}
              strokeWidth={2}
              className={filterIconClass(isMoodActive)}
              aria-hidden="true"
            />
          ) : null}
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
          className={splitChevronBtnClass(isMoodActive)}
        >
          <ChevronDown
            size={12}
            strokeWidth={2}
            className={`shrink-0 transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      <SplitFilterMenuPanel
        open={open}
        onClose={() => setOpen(false)}
        menuId={menuId}
        ariaLabel="Mood filters"
        testId="mood-filter-menu"
        panelRef={panelRef}
        rootRef={menuRef}
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
  availableAwardFestivals = [],
}: QuickFiltersProps) {
  const showAwardPicker =
    availableFilters.includes("award-winners") &&
    availableAwardFestivals.length > 0;
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
        if (option === "award-winners" && showAwardPicker) {
          return (
            <AwardWinnersFilterControl
              key={option}
              activeFilter={activeFilter}
              onFilterChange={onFilterChange}
              availableFestivals={availableAwardFestivals}
            />
          );
        }

        const isActive =
          option === "award-winners"
            ? activeFilter === "award-winners" ||
              isAwardFestivalFilter(activeFilter)
            : activeFilter === option;

        return (
          <FilterChip
            key={option}
            option={option}
            isActive={isActive}
            onClick={() =>
              onFilterChange(
                isActive
                  ? null
                  : option === "award-winners"
                    ? "award-winners"
                    : option
              )
            }
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
