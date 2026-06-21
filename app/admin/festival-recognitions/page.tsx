import Link from "next/link";
import { FestivalRecognitionsDashboard } from "@/components/FestivalRecognitionsDashboard";
import { getFestivalAdminSupabase } from "@/lib/get-festival-admin-supabase.mjs";
import { loadFestivalAdminData } from "@/lib/load-festival-recognitions-admin.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FestivalRecognitionsAdminPage() {
  const supabase = getFestivalAdminSupabase();
  const { allClaims, annecyClaims, confirmedAnnecyPresence, recognitions } =
    await loadFestivalAdminData(supabase);

  return (
    <main className="mx-auto max-w-6xl p-8">
      <Link href="/" className="mb-6 inline-block text-sm text-gray-500 hover:text-black">
        ← Back to library
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Festival recognitions</h1>
          <p className="mt-2 text-gray-600">
            Discovery claims in{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
              film_festival_claims
            </code>{" "}
            and confirmed facts in{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
              film_festival_recognitions
            </code>
            . Reads hosted QA data via service role (see{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
              .env.hosted.local
            </code>
            ).
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
        <FestivalRecognitionsDashboard
          allClaims={allClaims}
          annecyClaims={annecyClaims}
          confirmedAnnecyPresence={confirmedAnnecyPresence}
          recognitions={recognitions}
        />
      </div>
    </main>
  );
}
