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
        <div className="flex gap-2">
          <SkeletonBlock className="h-8 w-20" />
          <SkeletonBlock className="h-8 w-20" />
        </div>
      </div>
    </div>
  );
}

export default function GuidePageLoading({
  label = "Loading guide",
}: {
  label?: string;
}) {
  return (
    <main
      className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 sm:p-8"
      aria-busy="true"
      aria-label={label}
      data-testid="guide-loading-skeleton"
    >
      <SkeletonBlock className="mb-8 h-8 w-28" />
      <SkeletonBlock className="mb-3 h-9 w-80 max-w-full" />
      <SkeletonBlock className="mb-10 h-20 w-full max-w-2xl" />
      <SkeletonBlock className="mb-4 h-6 w-56" />
      <SkeletonBlock className="mb-6 h-12 w-full max-w-xl" />
      <section className="grid gap-4">
        <FilmCardSkeleton />
        <FilmCardSkeleton />
        <FilmCardSkeleton />
      </section>
    </main>
  );
}
