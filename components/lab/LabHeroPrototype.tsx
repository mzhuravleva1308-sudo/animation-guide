"use client";

import { useEffect, useId, useState, type ComponentType } from "react";
import {
  ArchiveRestore,
  Bookmark,
  CalendarClock,
  Check,
  ChevronDown,
  CircleCheck,
  Clapperboard,
  Film as FilmIcon,
  Rocket,
  Search,
  Sparkles,
  Sun,
  Trophy,
} from "lucide-react";
import {
  HeaderIconButton,
  HEADER_NAV_ICON,
  headerNavLabelCollapse,
} from "@/components/HeaderIconControl";
import ResonaleBrand, {
  RESONALE_LAVENDER,
  RESONALE_NAVY,
} from "@/components/ResonaleBrand";
/** Shared resting outline for search, AI Search, and filter chips */
const LAB_CONTROL_BORDER =
  "border border-[rgba(176,178,198,0.42)] hover:border-[rgba(177,169,217,0.48)]";
const LAB_CONTROL_BORDER_FOCUS =
  "focus:border-[rgba(177,169,217,0.55)] focus:ring-2 focus:ring-[rgba(177,169,217,0.18)]";

type FilterChipDef = {
  id: string;
  label: string;
  Icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  options: string[];
};

const FILTER_CHIPS: FilterChipDef[] = [
  {
    id: "recent",
    label: "Recent",
    Icon: CalendarClock,
    options: ["Recent", "This year", "Last 5 years"],
  },
  {
    id: "awards",
    label: "Award winners",
    Icon: Trophy,
    options: ["Award winners", "Annecy", "Zagreb", "Ottawa"],
  },
  {
    id: "technique",
    label: "Stop motion",
    Icon: FilmIcon,
    options: ["Stop motion", "2D", "3D", "Mixed media"],
  },
  {
    id: "theme",
    label: "Sci-Fi",
    Icon: Rocket,
    options: ["Sci-Fi", "Sarcasm", "Cultures"],
  },
  {
    id: "mood",
    label: "Light",
    Icon: Sun,
    options: ["Light", "Distance"],
  },
];

function LabSplitFilterChip({
  chip,
  activeId,
  selectedLabel,
  onApply,
}: {
  chip: FilterChipDef;
  activeId: string | null;
  selectedLabel: string;
  onApply: (id: string | null, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const isActive = activeId === chip.id;
  const Icon = chip.Icon;
  const shownLabel = isActive ? selectedLabel : chip.label;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const shellTone = open
    ? "border-[rgba(177,169,217,0.65)] bg-[rgba(255,255,255,0.82)]"
    : isActive
      ? "border-[rgba(177,169,217,0.5)] bg-[rgba(255,255,255,0.78)]"
      : `${LAB_CONTROL_BORDER} bg-[rgba(255,255,255,0.65)] hover:bg-[rgba(255,255,255,0.8)]`;

  return (
    <div
      className={`relative inline-flex shrink-0 ${open ? "z-30" : ""}`}
      role="group"
      aria-label={chip.label}
    >
      <div
        className={`relative z-30 inline-flex h-[27px] items-stretch overflow-hidden rounded-[14px] backdrop-blur-[14px] transition-[background-color,border-color] duration-150 ${shellTone}`}
      >
        {/* Left: apply / clear — no divider before chevron */}
        <button
          type="button"
          aria-pressed={isActive}
          title="Apply filter"
          onClick={() => {
            setOpen(false);
            onApply(isActive ? null : chip.id, chip.label);
          }}
          className="inline-flex h-full items-center gap-1.5 py-0 pr-1 pl-3.5 font-sans text-[13px] font-normal leading-none tracking-tight text-[#4a4b5c] antialiased transition-colors [font-synthesis:none] hover:text-[#2f3040] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900"
        >
          {Icon ? (
            <Icon
              size={11}
              strokeWidth={2}
              className="shrink-0 text-[#6b6c80]"
            />
          ) : null}
          {shownLabel}
        </button>
        {/* Right: open the options list */}
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label={`${chip.label} options`}
          title="Open list"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-full items-center justify-center py-0 pr-3.5 pl-0.5 text-[#6b6c80] transition-colors hover:text-[#2f3040] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-900"
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
            id={menuId}
            role="menu"
            aria-label={chip.label}
            className="absolute top-full left-0 z-30 mt-2 w-max min-w-[11rem] overflow-hidden rounded-[14px] border border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.72)] py-1.5 shadow-[0_8px_28px_rgba(35,36,61,0.1)] backdrop-blur-[14px]"
          >
            {chip.options.map((option) => {
              const selected = isActive && option === selectedLabel;
              return (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    onApply(chip.id, option);
                    setOpen(false);
                  }}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 px-3.5 py-2 text-left font-sans text-[13px] tracking-tight transition-colors ${
                    selected
                      ? "bg-[rgba(177,169,217,0.18)] text-[#2f3040]"
                      : "text-[#4a4b5c] hover:bg-[rgba(255,255,255,0.55)] hover:text-[#2f3040]"
                  }`}
                >
                  {option}
                  {selected ? (
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
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function LabHeroPrototype() {
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [selectedLabels, setSelectedLabels] = useState<Record<string, string>>(
    {}
  );
  const [artTone, setArtTone] = useState<"color" | "soft" | "bw">("soft");
  const animationNav = headerNavLabelCollapse(true);
  const filmsNav = headerNavLabelCollapse(false);
  const savedNav = headerNavLabelCollapse(false);
  const watchedNav = headerNavLabelCollapse(false);
  const artToneClass =
    artTone === "bw"
      ? "grayscale"
      : artTone === "soft"
        ? "grayscale-[45%] contrast-[0.96] saturate-[0.85]"
        : "";

  return (
    <main className="min-h-screen bg-white text-[#1a1a2e]">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:p-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="font-sans text-[11px] tracking-wide text-[#a0a1b4]">
            Lab prototype · not wired to production catalog
          </p>
          <div
            className="inline-flex items-center gap-1 rounded-full border border-[rgba(176,178,198,0.42)] bg-[rgba(255,255,255,0.65)] p-0.5"
            role="group"
            aria-label="Hero art tone"
          >
            {(
              [
                { id: "color", label: "Color" },
                { id: "soft", label: "Soft" },
                { id: "bw", label: "B&W" },
              ] as const
            ).map((option) => {
              const selected = artTone === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setArtTone(option.id)}
                  className={`rounded-full px-2.5 py-1 font-sans text-[11px] tracking-wide transition-colors ${
                    selected
                      ? "bg-[#1a1b2e] text-white"
                      : "text-[#8b8c9e] hover:text-[#2f3040]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Current production header — logo without tagline */}
        <header>
          <div className="flex flex-nowrap items-center justify-between gap-1 sm:gap-3">
            <ResonaleBrand href="/" showTagline={false} />

            <nav
              aria-label="Catalog and lists"
              className="flex shrink-0 items-center gap-0 sm:gap-2 md:gap-3"
            >
              <HeaderIconButton
                label="Animation"
                active
                labelClassName={animationNav.labelClassName}
                iconActiveClassName={animationNav.iconActiveClassName}
              >
                <FilmIcon
                  size={HEADER_NAV_ICON.size}
                  strokeWidth={HEADER_NAV_ICON.strokeWidth}
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                />
              </HeaderIconButton>
              <HeaderIconButton
                label="Films"
                labelClassName={filmsNav.labelClassName}
                iconActiveClassName={filmsNav.iconActiveClassName}
              >
                <Clapperboard
                  size={HEADER_NAV_ICON.size}
                  strokeWidth={HEADER_NAV_ICON.strokeWidth}
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                />
              </HeaderIconButton>
              <HeaderIconButton
                label="Saved"
                labelClassName={savedNav.labelClassName}
                iconActiveClassName={savedNav.iconActiveClassName}
              >
                <Bookmark
                  size={HEADER_NAV_ICON.size}
                  strokeWidth={HEADER_NAV_ICON.strokeWidth}
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                />
              </HeaderIconButton>
              <HeaderIconButton
                label="Watched"
                labelClassName={watchedNav.labelClassName}
                iconActiveClassName={watchedNav.iconActiveClassName}
              >
                <CircleCheck
                  size={HEADER_NAV_ICON.size}
                  strokeWidth={HEADER_NAV_ICON.strokeWidth}
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                />
              </HeaderIconButton>
              <div
                className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide text-white"
                style={{ backgroundColor: RESONALE_NAVY }}
                aria-label="Account MA"
              >
                MA
              </div>
            </nav>
          </div>
        </header>

        {/*
          Title + search stack on the left; art floats on the right of the
          copy only — search is not pushed under the illustration.
        */}
        <section className="relative mt-7 sm:mt-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[-28px] right-0 left-0 z-0 hidden h-[200px] sm:block sm:h-[240px] md:h-[260px]"
            style={{
              WebkitMaskImage:
                "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.55) 22%, #000 42%)",
              maskImage:
                "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.55) 22%, #000 42%)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/lab/hero-backdrop.png"
              alt=""
              width={2172}
              height={724}
              decoding="async"
              className={`h-full w-full select-none object-cover object-right ${artToneClass}`}
            />
          </div>

          <div className="relative z-10 max-w-fit">
            <h1
              className="whitespace-nowrap font-sans text-[30px] font-semibold leading-[1.08] tracking-tight antialiased [font-synthesis:none] sm:text-[38px]"
              style={{ color: RESONALE_NAVY }}
            >
              Indie & Festival Animation
            </h1>
            <p className="mt-2 max-w-xl font-sans text-[14px] font-normal leading-snug tracking-tight text-[#6b7280] antialiased [font-synthesis:none] sm:text-[15px]">
              Discover strange, beautiful and emotionally resonant animated
              films to watch next.
            </p>
          </div>

          <div className="relative z-10 mt-4 sm:mt-5">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <label className="relative block w-full max-w-[18.5rem] sm:max-w-[20rem]">
                <span className="sr-only">Search</span>
                <Search
                  size={14}
                  strokeWidth={2}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#8b8c9e]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  placeholder="Search films, directors, festivals, themes..."
                  className={`h-[34px] w-full rounded-full bg-[rgba(255,255,255,0.65)] pr-3 pl-9 font-sans text-[13px] tracking-tight text-[#2f3040] outline-none backdrop-blur-[14px] placeholder:text-[#9a9baf] ${LAB_CONTROL_BORDER} ${LAB_CONTROL_BORDER_FOCUS}`}
                />
              </label>

              <button
                type="button"
                className="inline-flex h-[34px] shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 font-sans text-[13px] font-medium tracking-tight transition hover:brightness-[0.98]"
                style={{
                  backgroundColor: "#efeaf8",
                  borderColor: "#e4dcf2",
                  color: "#6b5ea8",
                }}
              >
                <Sparkles
                  size={13}
                  strokeWidth={2}
                  style={{ color: RESONALE_LAVENDER }}
                  aria-hidden="true"
                />
                AI Search
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {FILTER_CHIPS.map((chip) => (
                <LabSplitFilterChip
                  key={chip.id}
                  chip={chip}
                  activeId={activeFilterId}
                  selectedLabel={selectedLabels[chip.id] ?? chip.label}
                  onApply={(id, label) => {
                    setActiveFilterId(id);
                    if (id) {
                      setSelectedLabels((current) => ({
                        ...current,
                        [id]: label,
                      }));
                    }
                  }}
                />
              ))}
              <button
                type="button"
                aria-label="Archived"
                title="Archived"
                className={`inline-flex h-[27px] w-[27px] items-center justify-center rounded-[14px] bg-[rgba(255,255,255,0.65)] text-[#6b6c80] backdrop-blur-[14px] transition hover:bg-[rgba(255,255,255,0.8)] hover:text-[#2f3040] ${LAB_CONTROL_BORDER}`}
              >
                <ArchiveRestore size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <div
          className="mt-9 grid grid-cols-2 gap-3 opacity-35 sm:grid-cols-4"
          aria-hidden="true"
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[2/3] rounded-xl bg-gradient-to-b from-[#eceaf5] to-[#f7f6fb]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
