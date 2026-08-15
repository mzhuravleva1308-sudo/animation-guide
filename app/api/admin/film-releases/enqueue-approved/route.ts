import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import { DISCOVERY_REVIEW_STATUS } from "@/lib/film-discovery.mjs";
import { enqueueDiscoveryCandidateForRelease } from "@/lib/discovery-release-enqueue.mjs";

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Re-enqueue an already-approved candidate (e.g. approved before this flow shipped). */
export async function POST(request: Request) {
  const access = await requireAdminApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const body = await request.json();
    const id = typeof body.candidate_id === "string" ? body.candidate_id : "";
    if (!id) {
      return NextResponse.json(
        { error: "candidate_id is required" },
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

    const { data: candidate, error } = await supabase
      .from("film_discovery_candidates")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }
    if (candidate.review_status !== DISCOVERY_REVIEW_STATUS.approved) {
      return NextResponse.json(
        { error: "Only approved candidates can be enqueued for release" },
        { status: 400 }
      );
    }

    const release = await enqueueDiscoveryCandidateForRelease(supabase, candidate, {
      replaceActive: Boolean(body.replace_active),
    });

    return NextResponse.json({ ok: true, release });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Enqueue approved failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
