import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  FilmReleasesDashboard,
  type ReleaseQueueRow,
} from "@/components/FilmReleasesDashboard";
import { getAdminAccessStatus } from "@/lib/auth/require-admin";
import { getFestivalAdminSupabase } from "@/lib/get-festival-admin-supabase.mjs";
import { DISCOVERY_RELEASE_ORIGIN } from "@/lib/discovery-to-import-payload.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FilmReleasesAdminPage() {
  const access = await getAdminAccessStatus();

  if (access === "unauthenticated") {
    redirect("/login");
  }

  if (access !== "admin") {
    notFound();
  }

  const supabase = getFestivalAdminSupabase();

  let { data, error } = await supabase
    .from("film_import_queue")
    .select(
      "id, title, year, status, result_status, result_message, result_checklist, origin, discovery_candidate_id, film_id, created_at, finished_at"
    )
    .eq("origin", DISCOVERY_RELEASE_ORIGIN)
    .order("created_at", { ascending: false });

  if (error && /result_checklist|origin|discovery_candidate/i.test(error.message)) {
    return (
      <main className="mx-auto max-w-6xl p-8">
        <Link href="/admin/film-discovery" className="mb-6 inline-block text-sm text-gray-500 hover:text-black">
          ← Film discovery
        </Link>
        <h1 className="text-3xl font-semibold">Film releases</h1>
        <p className="mt-4 text-amber-800">
          Migration not applied yet ({error.message}). Run{" "}
          <code className="text-sm">20260815_discovery_release_queue.sql</code>{" "}
          on hosted before using this page.
        </p>
      </main>
    );
  }

  if (error) throw error;

  const queueRows = data ?? [];
  const filmIds = queueRows.map((row) => row.film_id).filter(Boolean);
  const candidateIds = queueRows
    .map((row) => row.discovery_candidate_id)
    .filter(Boolean);

  const [{ data: films }, { data: candidates }] = await Promise.all([
    filmIds.length
      ? supabase
          .from("films")
          .select("id, title, catalog_visible, poster_url")
          .in("id", filmIds)
      : Promise.resolve({ data: [] }),
    candidateIds.length
      ? supabase
          .from("film_discovery_candidates")
          .select("id, release_status, release_blockers")
          .in("id", candidateIds)
      : Promise.resolve({ data: [] }),
  ]);

  const filmById = new Map((films ?? []).map((film) => [film.id, film]));
  const candidateById = new Map(
    (candidates ?? []).map((candidate) => [candidate.id, candidate])
  );

  const rows: ReleaseQueueRow[] = queueRows.map((row) => ({
    ...row,
    film: row.film_id ? filmById.get(row.film_id) ?? null : null,
    candidate: row.discovery_candidate_id
      ? candidateById.get(row.discovery_candidate_id) ?? null
      : null,
  }));

  return (
    <main className="mx-auto max-w-6xl p-8">
      <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-black">
        ← Back to library
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Film releases</h1>
          <p className="mt-2 text-gray-600">
            Discovery approvals land here as prep queue items (hidden cards).
            Prep starts automatically on Approve; Go live in a batch so profile
            scores rebuild once.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm">
          <Link href="/admin/film-discovery" className="text-gray-500 hover:text-black">
            Film discovery →
          </Link>
          <Link href="/admin/catalog-analytics" className="text-gray-500 hover:text-black">
            Catalog analytics →
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <FilmReleasesDashboard rows={rows} />
      </div>
    </main>
  );
}
