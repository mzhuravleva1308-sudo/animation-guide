"use client";

import GuideSectionHeader from "@/components/guides/GuideSectionHeader";
import { useRef } from "react";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />;
}

function FilmCardSkeleton() {
  return (
    <div className="grid gap-5 rounded-2xl border border-gray-100 p-5 md:grid-cols-[160px_1fr]">
      <SkeletonBlock className="h-56 w-full md:h-60" />
      <div className="space-y-4">
        <SkeletonBlock className="h-7 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
        <SkeletonBlock className="h-20 w-full" />
      </div>
    </div>
  );
}

/**
 * Prefetchable segment fallback for /guides/* and /festivals/*.
 * Distinct from GuidePageClient so soft nav remounts the ready page.
 * Real title/intro arrive next via GuidePagePendingShell.
 */
export default function GuideRouteLoading({
  label = "Loading guide",
}: {
  label?: string;
}) {
  const authTriggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      aria-busy="true"
      aria-label={label}
      data-testid="guide-route-loading"
    >
      <GuideSectionHeader
        auth={null}
        authTriggerRef={authTriggerRef}
        openAuthModal={() => {}}
      />
      <div className="mt-10 mb-8 sm:mt-12 sm:mb-10">
        <SkeletonBlock className="mb-3 h-4 w-16" />
        <SkeletonBlock className="mb-4 h-9 w-80 max-w-full" />
        <SkeletonBlock className="h-20 w-full max-w-2xl" />
      </div>
      <section className="grid gap-4">
        <FilmCardSkeleton />
        <FilmCardSkeleton />
        <FilmCardSkeleton />
      </section>
    </main>
  );
}
