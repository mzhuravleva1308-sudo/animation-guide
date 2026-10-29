"use client";

import Link from "next/link";

/** Brand board colors — logo stroke / wordmark use a deep cool indigo (not UI chrome). */
export const RESONALE_NAVY = "#23243D";
export const RESONALE_LAVENDER = "#B1A9D9";

const NAVY = RESONALE_NAVY;
const LAVENDER = RESONALE_LAVENDER;
const GUIDE_LABEL = "GUIDE";

/** Site name beside the lockup — shortens on smaller breakpoints. */
export const RESONALE_BRAND_TAGLINE = "Indie & Festival Animation";
const BRAND_TAGLINE_MEDIUM = "Festival Animation";
const BRAND_TAGLINE_SHORT = "Animation";

/** GUIDE left edge at the middle of “n” in “nale”. */
const ESONALE_START_X = 122;
const GUIDE_X = 184;

/**
 * Resonale lockup: wave → continuous R + “esonale” + “GUIDE”.
 * R + wordmark stay in one SVG so the mark doesn’t drift vs “esonale”.
 */
function ResonaleLogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 350 78"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Soft lavender resonance line */}
      <path
        d="M8 44
           C 18 44 22 34 32 34
           C 43 34 47 46 58 46
           C 67 46 72 38 78 33"
        stroke={LAVENDER}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/*
        Continuous navy stroke:
        left sine wave → rises into R stem → bowl → diagonal leg
      */}
      <path
        d="M6 36
           C 16 36 21 26 31 26
           C 42 26 46 39 57 39
           C 66 39 72 31 77 26
           C 81 21 84 14 84 10
           C 84 5 88 2 95 2
           C 110 2 120 14 113 27
           C 109 35 99 39 91 34
           C 89 33 87.5 31 87.5 31
           L 116 58"
        stroke={NAVY}
        strokeWidth="4.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Eyes in the R bowl — vertical ovals, ~19° tops-left (ref crop) */}
      <ellipse
        cx="97.4"
        cy="24.2"
        rx="2.15"
        ry="3.7"
        fill={NAVY}
        transform="rotate(-19 97.4 24.2)"
      />
      <ellipse
        cx="104.8"
        cy="21.6"
        rx="2.15"
        ry="3.7"
        fill={NAVY}
        transform="rotate(-19 104.8 21.6)"
      />

      <text
        x={ESONALE_START_X}
        y="35"
        fill={NAVY}
        fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
        fontSize="33.6"
        fontWeight="500"
        letterSpacing="-0.02em"
      >
        esonale
      </text>

      {/*
        Starts at the middle of “n” in “nale”. Letters stagger in on first paint.
      */}
      <text
        x={GUIDE_X}
        y="58"
        fill={LAVENDER}
        fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
        fontSize="16"
        fontWeight="600"
        letterSpacing="0.22em"
      >
        {GUIDE_LABEL.split("").map((char, index) => (
          <tspan
            key={`${char}-${index}`}
            className="resonale-guide-letter"
            style={{ animationDelay: `${200 + index * 55}ms` }}
          >
            {char === " " ? "\u00A0" : char}
          </tspan>
        ))}
      </text>
    </svg>
  );
}

type ResonaleBrandProps = {
  href?: string;
  onClick?: () => void;
  /** Show the site name beside the lockup (default on). */
  showTagline?: boolean;
};

export default function ResonaleBrand({
  href = "/",
  onClick,
  showTagline = true,
}: ResonaleBrandProps) {
  return (
    <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
      <Link
        href={href}
        onClick={(event) => {
          if (!onClick) {
            return;
          }

          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
          }

          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          onClick();
        }}
        className="inline-flex shrink-0 items-center overflow-visible rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        aria-label="Resonale home"
      >
        {/* Full lockup height (wordmark + GUIDE) so the title can center against it. */}
        {/* Width hugs ink (through GUIDE), not empty SVG trailing space. */}
        <span className="relative block h-[30px] w-[6.75rem] overflow-visible sm:h-[39px] sm:w-[8.5rem]">
          <ResonaleLogoMark className="pointer-events-none absolute top-0 left-0 h-full w-auto max-w-none overflow-visible" />
        </span>
      </Link>

      {showTagline ? (
        /*
          Separate from the lockup. One large line, optically as tall as
          Resonale + GUIDE. Shortens when the header gets tight:
          full → Festival Animation → Animation.
        */
        <p
          aria-hidden="true"
          className="m-0 hidden shrink-0 font-sans text-[20px] font-medium leading-none tracking-tight antialiased [font-synthesis:none] sm:block sm:text-[23px] md:text-[26px]"
          style={{ color: NAVY }}
        >
          <span className="hidden whitespace-nowrap lg:inline">
            {RESONALE_BRAND_TAGLINE}
          </span>
          <span className="hidden whitespace-nowrap md:inline lg:hidden">
            {BRAND_TAGLINE_MEDIUM}
          </span>
          <span className="inline whitespace-nowrap md:hidden">
            {BRAND_TAGLINE_SHORT}
          </span>
        </p>
      ) : null}
    </div>
  );
}
