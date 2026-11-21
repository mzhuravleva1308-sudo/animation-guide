function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-200 ${className}`} />;
}

function FilmCardSkeleton() {
  return (
    <div
      data-testid="profile-loading-skeleton"
      className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 rounded-2xl border border-gray-100 p-3 min-[900px]:grid-cols-[140px_minmax(0,1fr)] min-[900px]:gap-x-0 min-[900px]:p-0 min-[1100px]:grid-cols-[190px_minmax(0,1fr)]"
    >
      <SkeletonBlock className="aspect-[2/3] w-full rounded-xl min-[900px]:row-span-2 min-[900px]:aspect-auto min-[900px]:min-h-[12rem] min-[900px]:rounded-none" />
      <div className="space-y-3 min-[900px]:p-5">
        <SkeletonBlock className="h-5 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
      <div className="col-span-2 space-y-3 pt-3 min-[900px]:col-span-1 min-[900px]:col-start-2 min-[900px]:px-5 min-[900px]:pb-5 min-[900px]:pt-0">
        <SkeletonBlock className="h-16 w-full" />
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
