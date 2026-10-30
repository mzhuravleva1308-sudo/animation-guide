import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  FilmDiscoveryReviewDashboard,
  type DiscoveryCandidateRow,
} from "@/components/FilmDiscoveryReviewDashboard";
import { getAdminAccessStatus } from "@/lib/auth/require-admin";
import { annotateDiscoveryCandidatesWithNearDuplicates } from "@/lib/film-discovery-pending-review.mjs";
import { autoRejectSamePosterNearDuplicates } from "@/lib/film-discovery-poster-dupe-actions.mjs";
import { getFestivalAdminSupabase } from "@/lib/get-festival-admin-supabase.mjs";
import { enrichNearDuplicatesWithPosterSimilarity } from "@/lib/poster-similarity.mjs";

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
      "id, title, original_title, year, directors, countries, runtime_minutes, source_urls, manager_why, researcher_why, eligibility_result, eligibility_evidence, review_status, reject_reason, source, created_at, poster_url, poster_source_label, trailer_url, trailer_source_label, media_status, media_notes, synopsis, the_mood, technique, moods, aesthetic_tags, storytelling_tags, quick_filters, has_festival, festival_claims, festival_recognitions, content_status, content_note, content_revision_count, release_status, release_queue_id, release_blockers, film_id"
    )
    .order("created_at", { ascending: false });

  if (error && /synopsis|the_mood|content_status|technique|content_note|aesthetic_tags|storytelling_tags|quick_filters|has_festival|festival_claims|festival_recognitions|release_status|eligibility_evidence/i.test(error.message)) {
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
      aesthetic_tags: null,
      storytelling_tags: null,
      quick_filters: null,
      has_festival: null,
      festival_claims: null,
      festival_recognitions: null,
      content_status: null,
      content_note: null,
      content_revision_count: null,
      release_status: null,
      release_queue_id: null,
      release_blockers: null,
      film_id: null,
      eligibility_evidence: {},
    }));
    error = fallback.error;
  }

  if (error) {
    throw error;
  }

  const { data: catalogFilms, error: catalogError } = await supabase
    .from("films")
    .select(
      "id, title, original_title, year, normalized_title, normalized_original_title, poster_url, image_url"
    );
  if (catalogError) {
    throw catalogError;
  }

  const annotated = annotateDiscoveryCandidatesWithNearDuplicates(
    (data ?? []) as DiscoveryCandidateRow[],
    catalogFilms ?? []
  ) as DiscoveryCandidateRow[];

  const enriched = (await enrichNearDuplicatesWithPosterSimilarity(
    annotated,
    { onlyPendingReview: true, concurrency: 4 }
  )) as DiscoveryCandidateRow[];

  const { rejected: autoRejected } = await autoRejectSamePosterNearDuplicates(
    supabase,
    enriched
  );
  const rejectedIds = new Set(autoRejected.map((row) => row.id));
  const candidates = enriched.map((row) =>
    rejectedIds.has(row.id)
      ? {
          ...row,
          review_status: "rejected",
          reject_reason:
            autoRejected.find((item) => item.id === row.id)?.reason ??
            row.reject_reason,
        }
      : row
  ) as DiscoveryCandidateRow[];

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
            Approve enqueues a hidden prep card; public go-live is batched on
            Film releases.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm">
          <Link
            href="/admin/film-releases"
            className="text-gray-500 hover:text-black"
          >
            Film releases →
          </Link>
          <Link
            href="/admin/catalog-analytics"
            className="text-gray-500 hover:text-black"
          >
            Catalog analytics →
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <FilmDiscoveryReviewDashboard candidates={candidates} />
      </div>
    </main>
  );
}
