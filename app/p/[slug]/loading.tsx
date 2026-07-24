function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />;
}

function FilmCardSkeleton() {
  return (
    <div
      data-testid="profile-loading-skeleton"
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
          <SkeletonBlock className="h-8 w-20" />
        </div>
        <div className="flex justify-between pt-2">
          <SkeletonBlock className="h-10 w-48" />
          <SkeletonBlock className="h-10 w-32" />
        </div>
      </div>
    </div>
  );
}

export default function ProfileLoading() {
  return (
    <main className="mx-auto w-full min-w-0 max-w-5xl p-8" aria-busy="true" aria-label="Loading profile">
      <header className="mb-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <SkeletonBlock className="h-7 w-40" />
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <SkeletonBlock className="h-8 w-20 rounded-lg" />
            <SkeletonBlock className="h-8 w-16 rounded-lg" />
            <SkeletonBlock className="h-8 w-20 rounded-lg" />
            <SkeletonBlock className="h-5 w-14" />
          </div>
        </div>
        <div className="max-w-2xl">
          <SkeletonBlock className="h-5 w-full max-w-lg" />
        </div>
      </header>

      <SkeletonBlock className="mb-3 h-11 w-full rounded-xl" />
      <div className="mb-3 flex flex-wrap gap-2">
        <SkeletonBlock className="h-8 w-16 rounded-full" />
        <SkeletonBlock className="h-8 w-20 rounded-full" />
        <SkeletonBlock className="h-8 w-28 rounded-full" />
        <SkeletonBlock className="h-8 w-24 rounded-full" />
      </div>
      <SkeletonBlock className="mb-4 h-4 w-40" />

      <section className="grid gap-4">
        <FilmCardSkeleton />
        <FilmCardSkeleton />
        <FilmCardSkeleton />
      </section>
    </main>
  );
}
