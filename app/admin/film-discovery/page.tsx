import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  FilmDiscoveryReviewDashboard,
  type DiscoveryCandidateRow,
} from "@/components/FilmDiscoveryReviewDashboard";
import { getAdminAccessStatus } from "@/lib/auth/require-admin";
import { getFestivalAdminSupabase } from "@/lib/get-festival-admin-supabase.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FilmDiscoveryAdminPage() {
  const access = await getAdminAccessStatus();

  if (access === "unauthenticated") {
    redirect("/login");
  }

  if (access !== "admin") {
    notFound();
  }

  const supabase = getFestivalAdminSupabase();
  let { data, error } = await supabase
    .from("film_discovery_candidates")
    .select(
      "id, title, original_title, year, directors, countries, runtime_minutes, source_urls, manager_why, researcher_why, eligibility_result, review_status, reject_reason, source, created_at, poster_url, poster_source_label, trailer_url, trailer_source_label, media_status, media_notes, synopsis, the_mood, technique, moods, content_status, content_note, content_revision_count"
    )
    .order("created_at", { ascending: false });

  if (error && /synopsis|the_mood|content_status|technique|content_note/i.test(error.message)) {
    const fallback = await supabase
      .from("film_discovery_candidates")
      .select(
        "id, title, original_title, year, directors, countries, runtime_minutes, source_urls, manager_why, researcher_why, eligibility_result, review_status, reject_reason, source, created_at, poster_url, poster_source_label, trailer_url, trailer_source_label, media_status, media_notes"
      )
      .order("created_at", { ascending: false });
    data = (fallback.data ?? []).map((row) => ({
      ...row,
      synopsis: null,
      the_mood: null,
      technique: null,
      moods: null,
      content_status: null,
      content_note: null,
      content_revision_count: null,
    }));
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  const candidates = (data ?? []) as DiscoveryCandidateRow[];

  return (
    <main className="mx-auto max-w-6xl p-8">
      <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-black">
        ← Back to library
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Film discovery review</h1>
          <p className="mt-2 text-gray-600">
            Manual approve/reject for weekly discovery and seeded candidates.
            Approved candidates stay out of the public catalog until a later
            enrichment stage.
          </p>
        </div>
        <Link
          href="/admin/catalog-analytics"
          className="text-sm text-gray-500 hover:text-black"
        >
          Catalog analytics →
        </Link>
      </div>

      <div className="mt-8">
        <FilmDiscoveryReviewDashboard candidates={candidates} />
      </div>
    </main>
  );
}
