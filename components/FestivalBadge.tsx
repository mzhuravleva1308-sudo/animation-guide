"use client";

import type { FestivalBadge as FestivalBadgeType } from "@/types/festival-badge";

function LaurelBranch({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 64"
      aria-hidden="true"
      className={`h-7 w-4 shrink-0 ${className}`}
      fill="currentColor"
    >
      <path d="M22.8 4.2C11.1 14.4 7.5 31.2 11.7 45.7C13.2 51 16.4 56 21.2 60.2C15.7 57.6 11.8 52.8 9.6 46.4C4.9 32.8 8.2 14.5 22.8 4.2Z" opacity="0.35" />

      <path d="M20.8 6.5C17.2 5.8 14.4 7.3 13.1 10.8C16.8 11.2 19.6 9.8 20.8 6.5Z" />
      <path d="M16.9 11.5C13.2 10.7 10.3 12.4 9.1 16.1C12.9 16.4 15.8 14.9 16.9 11.5Z" />
      <path d="M14.1 17.1C10.3 16.4 7.4 18.4 6.5 22.2C10.3 22.2 13.1 20.5 14.1 17.1Z" />
      <path d="M12.6 23.2C8.9 23 6.3 25.3 5.9 29.2C9.5 28.7 12 26.6 12.6 23.2Z" />
      <path d="M12.4 29.5C8.9 30 6.7 32.7 6.9 36.5C10.3 35.5 12.4 33.1 12.4 29.5Z" />
      <path d="M13.4 35.7C10.2 36.9 8.5 39.9 9.2 43.5C12.2 42 13.9 39.3 13.4 35.7Z" />
      <path d="M15.8 41.5C13.1 43.4 12.1 46.6 13.5 49.9C16 47.7 17 44.7 15.8 41.5Z" />
      <path d="M19.2 46.8C17.1 49.2 16.8 52.4 18.8 55.2C20.7 52.6 21 49.6 19.2 46.8Z" />

      <path d="M23.4 10.5C20.2 12.2 19.2 15.2 20.4 18.5C23.4 16.5 24.4 13.6 23.4 10.5Z" />
      <path d="M20.2 16.1C17.1 18 16.3 21.1 17.7 24.3C20.5 22.1 21.3 19.2 20.2 16.1Z" />
      <path d="M18.1 22.2C15.4 24.5 15 27.6 16.8 30.5C19.2 28.1 19.7 25.1 18.1 22.2Z" />
      <path d="M17.4 28.6C15 31.2 15.1 34.3 17.2 37C19.2 34.3 19.2 31.4 17.4 28.6Z" />
      <path d="M18.3 35C16.4 37.9 17 40.9 19.4 43.2C20.8 40.2 20.3 37.4 18.3 35Z" />
      <path d="M20.8 41C19.5 44.1 20.5 46.9 23.1 48.8C23.9 45.7 23 43.1 20.8 41Z" />
    </svg>
  );
}

function LaurelLeft() {
  return <LaurelBranch />;
}

function LaurelRight() {
  return <LaurelBranch className="scale-x-[-1]" />;
}

function FestivalBadgeItem({ badge }: { badge: FestivalBadgeType }) {
  const tooltipId = `festival-badge-tip-${badge.id}`;

  return (
    <span className="group/badge relative inline-flex">
      <span
        data-testid={`festival-badge-${badge.id}`}
        tabIndex={0}
        aria-describedby={tooltipId}
        className="inline-flex cursor-help items-center gap-1.5 text-[11px] font-semibold leading-none text-[#9a6a3a] outline-none ring-offset-2 transition-colors hover:text-[#7b4f27] focus-visible:ring-2 focus-visible:ring-[#8a5b2d]/30"
      >
        <LaurelLeft />
        <span className="whitespace-nowrap tracking-[0.02em]">
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