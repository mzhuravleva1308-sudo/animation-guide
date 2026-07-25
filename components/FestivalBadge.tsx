"use client";

import type { FestivalBadge as FestivalBadgeType } from "@/types/festival-badge";

const LAUREL_BRANCH_ASSET = "/assets/laurel-branch-left.svg";

function LaurelBranch({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-5 w-2.5 shrink-0 bg-current ${
        mirrored ? "scale-x-[-1]" : ""
      }`}
      style={{
        maskImage: `url("${LAUREL_BRANCH_ASSET}")`,
        maskRepeat: "no-repeat",
        maskPosition: "center",
        maskSize: "100% 100%",
        WebkitMaskImage: `url("${LAUREL_BRANCH_ASSET}")`,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        WebkitMaskSize: "100% 100%",
      }}
    />
  );
}

function LaurelLeft() {
  return <LaurelBranch />;
}

function LaurelRight() {
  return <LaurelBranch mirrored />;
}

function FestivalBadgeItem({ badge }: { badge: FestivalBadgeType }) {
  const tooltipId = `festival-badge-tip-${badge.id}`;

  return (
    <span className="group/badge relative inline-flex">
      <span
        data-testid={`festival-badge-${badge.id}`}
        tabIndex={0}
        aria-describedby={tooltipId}
        className="inline-flex max-w-full cursor-help items-center gap-0.5 text-xs font-medium text-[#8a5b2d] outline-none"
      >
        <LaurelLeft />
        <span className="min-w-0 text-center tracking-[0.02em]">
          {badge.label}
        </span>
        <LaurelRight />
      </span>

      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute right-0 top-[calc(100%+0.375rem)] z-20 w-max max-w-[16rem] scale-95 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left opacity-0 shadow-lg transition duration-150 group-hover/badge:scale-100 group-hover/badge:opacity-100 group-focus-within/badge:scale-100 group-focus-within/badge:opacity-100"
      >
        <span className="block text-xs font-semibold leading-snug text-gray-900">
          {badge.fullName}
        </span>
        <span className="mt-1 block text-[11px] leading-snug text-gray-600">
          {badge.description}
        </span>
      </span>
    </span>
  );
}

export function FestivalBadgeList({ badges }: { badges: FestivalBadgeType[] }) {
  if (!badges.length) {
    return null;
  }

  return (
    <ul
      className="flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1"
      data-testid="film-festival-badges"
      aria-label="Festival recognitions"
    >
      {badges.map((badge) => (
        <li key={badge.id}>
          <FestivalBadgeItem badge={badge} />
        </li>
      ))}
    </ul>
  );
}