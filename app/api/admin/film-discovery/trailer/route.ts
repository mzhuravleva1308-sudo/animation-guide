import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import { DISCOVERY_REVIEW_STATUS } from "@/lib/film-discovery.mjs";
import { buildManualDiscoveryTrailerPatch } from "@/lib/film-discovery-manual-trailer.mjs";

export const dynamic = "force-dynamic";

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  const access = await requireAdminApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const trailerUrl =
      typeof body.trailer_url === "string" ? body.trailer_url : null;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (trailerUrl === null) {
      return NextResponse.json(
        { error: "trailer_url is required (string; empty clears)" },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: "Admin Supabase is not configured" },
        { status: 500 }
      );
    }

    const { data: existing, error: loadError } = await supabase
      .from("film_discovery_candidates")
      .select("id, review_status, poster_url")
      .eq("id", id)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!existing) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (existing.review_status !== DISCOVERY_REVIEW_STATUS.pendingReview) {
      return NextResponse.json(
        { error: "Trailer can only be set while the candidate is pending review" },
        { status: 409 }
      );
    }

    const patch = buildManualDiscoveryTrailerPatch(existing, trailerUrl);

    const { data: updated, error: updateError } = await supabase
      .from("film_discovery_candidates")
      .update(patch)
      .eq("id", id)
      .eq("review_status", DISCOVERY_REVIEW_STATUS.pendingReview)
      .select(
        "id, trailer_url, trailer_provider, trailer_video_id, trailer_source, trailer_source_label, media_status, media_updated_at"
      )
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json(
        { error: "Candidate was already reviewed" },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, candidate: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save trailer";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
