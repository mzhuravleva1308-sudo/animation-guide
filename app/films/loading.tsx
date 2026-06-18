function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />;
}

function FilmCardSkeleton() {
  return (
    <div
      data-testid="films-loading-skeleton"
      className="grid gap-5 rounded-2xl border border-gray-100 p-5 md:grid-cols-[160px_1fr]"
    >
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

export default function FilmsLoading() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl p-8" aria-busy="true" aria-label="Loading catalog">
      <header className="mb-8">
        <SkeletonBlock className="mb-3 h-9 w-72 max-w-full" />
        <SkeletonBlock className="h-5 w-full max-w-lg" />
      </header>

      <SkeletonBlock className="mb-6 h-4 w-40" />
      <SkeletonBlock className="mb-6 h-12 w-full rounded-full" />

      <section className="grid gap-4">
        <FilmCardSkeleton />
        <FilmCardSkeleton />
        <FilmCardSkeleton />
      </section>
    </main>
  );
}
