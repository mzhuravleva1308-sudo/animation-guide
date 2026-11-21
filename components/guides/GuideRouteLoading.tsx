"use client";

import GuideSectionHeader from "@/components/guides/GuideSectionHeader";
import { useRef } from "react";

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />;
}

function FilmCardSkeleton() {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 rounded-2xl border border-gray-100 p-3 min-[900px]:grid-cols-[140px_minmax(0,1fr)] min-[900px]:gap-x-0 min-[900px]:p-0 min-[1100px]:grid-cols-[190px_minmax(0,1fr)]">
      <SkeletonBlock className="aspect-[2/3] w-full rounded-xl min-[900px]:row-span-2 min-[900px]:aspect-auto min-[900px]:min-h-[12rem] min-[900px]:rounded-none" />
      <div className="space-y-3 min-[900px]:p-5">
        <SkeletonBlock className="h-5 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
      <div className="col-span-2 space-y-3 pt-3 min-[900px]:col-span-1 min-[900px]:col-start-2 min-[900px]:px-5 min-[900px]:pb-5 min-[900px]:pt-0">
        <SkeletonBlock className="h-16 w-full" />
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
