import Link from "next/link";

const NAVY = "#1A1B2E";
const LAVENDER = "#B1A9D9";
const GUIDE_LABEL = "ANIMATION GUIDE";

/**
 * Resonale lockup: wave → continuous R + “esonale” + “ANIMATION GUIDE”.
 * Colors match the brand board: navy + muted lavender.
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

      <text
        x="122"
        y="35"
        fill={NAVY}
        fontFamily="var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif"
        fontSize="32"
        fontWeight="600"
        letterSpacing="-0.04em"
      >
        esonale
      </text>

      {/*
        ~10.5–11px on desktop at h-[3.25rem]; scales to ~8–9px on mobile h-9.
        Gap from wordmark baseline ≈ 5–6px displayed.
        Letters stagger in on first paint (see .resonale-guide-letter).
      */}
      <text
        x="124"
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
};

export default function ResonaleBrand({ href = "/" }: ResonaleBrandProps) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center overflow-visible rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      aria-label="Resonale home"
    >
      {/*
        Layout box matches the Resonale wordmark band so sibling nav
        centers against “esonale”, while ANIMATION GUIDE hangs below.
      */}
      <span className="relative block h-[21px] w-[8.8125rem] sm:h-6 sm:w-[10.6875rem]">
        <ResonaleLogoMark className="pointer-events-none absolute top-[-0.3rem] left-0 h-[30px] w-auto max-w-none sm:top-[-0.4125rem] sm:h-[39px]" />
      </span>
    </Link>
  );
}
