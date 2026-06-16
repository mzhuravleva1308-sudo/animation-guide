import Link from "next/link";

export function AdminFilmImportDisabled() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-black">
        ← Back to library
      </Link>

      <h1 className="text-3xl font-semibold">Manual film import disabled</h1>

      <p className="mt-4 text-gray-600">
        The admin UI for adding or importing films is deprecated. New films must
        be added through the controlled import pipeline so they get duplicate
        detection, validation, poster caching, and post-import enrichment.
      </p>

      <p className="mt-4 text-gray-600">
        Use the import scripts and{" "}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
          lib/insert-film.mjs
        </code>{" "}
        helpers instead of this page or direct Supabase inserts. See{" "}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">FILMS.md</code>{" "}
        for details.
      </p>

      <p className="mt-4 text-sm text-gray-500">
        Manual database edits are still acceptable for correcting existing
        records, not for creating new films.
      </p>
    </main>
  );
}
