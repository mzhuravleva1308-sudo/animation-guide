"use client";

import type { FestivalBadge as FestivalBadgeType } from "@/types/festival-badge";

function FestivalBadgeItem({ badge }: { badge: FestivalBadgeType }) {
  const tooltipId = `festival-badge-tip-${badge.id}`;

  return (
    <span className="group/badge relative inline-flex">
      <span
        data-testid={`festival-badge-${badge.id}`}
        tabIndex={0}
        aria-describedby={tooltipId}
        className="inline-flex cursor-help items-center rounded-full border border-l-[3px] bg-white px-2.5 py-1 text-[11px] font-semibold leading-none text-gray-900 shadow-sm outline-none ring-offset-2 transition-shadow focus-visible:ring-2 focus-visible:ring-gray-400"
        style={{
          borderTopColor: `${badge.color}29`,
          borderRightColor: `${badge.color}29`,
          borderBottomColor: `${badge.color}29`,
          borderLeftColor: badge.color,
        }}
      >
        {badge.label}
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
      className="flex max-w-full flex-wrap items-center justify-end gap-1.5"
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
