import Link from "next/link";

/** Brand board colors — logo stroke / wordmark use a deep cool indigo (not UI chrome). */
export const RESONALE_NAVY = "#23243D";
export const RESONALE_LAVENDER = "#B1A9D9";

const NAVY = RESONALE_NAVY;
const LAVENDER = RESONALE_LAVENDER;
const GUIDE_LABEL = "GUIDE";

/**
 * Wave → continuous R mark only. Wordmark text sits beside it in HTML
 * so GUIDE can right-align to “esonale” via CSS (font metrics vary).
 */
function ResonaleRMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
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
    </svg>
  );
}

function ResonaleWordmark() {
  return (
    <span className="flex flex-col items-end leading-none">
      <span
        className="pr-[0.02em] text-[12.9px] font-medium tracking-[-0.02em] sm:text-[16.8px]"
        style={{ color: NAVY }}
      >
        esonale
      </span>
      {/*
        items-end keeps GUIDE’s right edge flush with “esonale”.
        mt leaves a clear gap under the wordmark.
        Letters stagger in on first paint (see .resonale-guide-letter).
      */}
      <span
        className="mt-[0.25rem] flex justify-end gap-[0.22em] text-[6.15px] font-semibold sm:mt-[0.3rem] sm:text-[8px]"
        style={{ color: LAVENDER }}
      >
        {GUIDE_LABEL.split("").map((char, index) => (
          <span
            key={`${char}-${index}`}
            className="resonale-guide-letter inline-block"
            style={{ animationDelay: `${200 + index * 55}ms` }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
      </span>
    </span>
  );
}

type ResonaleBrandProps = {
  href?: string;
  onClick?: () => void;
};

export default function ResonaleBrand({ href = "/", onClick }: ResonaleBrandProps) {
  return (
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
      {/*
        Layout box matches the Resonale wordmark band so sibling nav
        centers against “esonale”, while GUIDE hangs below.
      */}
      <span className="relative block h-[21px] w-[8.5rem] overflow-visible sm:h-6 sm:w-[10.6875rem]">
        <span className="pointer-events-none absolute top-[-0.3rem] left-0 inline-flex items-start gap-[0.1rem] overflow-visible sm:top-[-0.4125rem] sm:gap-[0.15rem]">
          <ResonaleRMark className="h-[30px] w-auto shrink-0 sm:h-[39px]" />
          <ResonaleWordmark />
        </span>
      </span>
    </Link>
  );
}
