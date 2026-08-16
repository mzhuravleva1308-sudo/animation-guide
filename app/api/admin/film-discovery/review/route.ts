import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import {
  buildApproveCandidatePatch,
  buildRejectCandidatePatch,
} from "@/lib/film-discovery-workflow.mjs";
import { DISCOVERY_REVIEW_STATUS } from "@/lib/film-discovery.mjs";
import { enqueueDiscoveryCandidateForRelease } from "@/lib/discovery-release-enqueue.mjs";
import { runDiscoveryReleasePrepForQueueId } from "@/lib/run-discovery-release-prep.mjs";

export const dynamic = "force-dynamic";
/** Prep (embeddings + poster cache) continues after the Approve response via after(). */
export const maxDuration = 300;

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
    const action =
      body.action === "approve" || body.action === "reject" ? body.action : null;
    const rejectReason =
      typeof body.reject_reason === "string" ? body.reject_reason : null;

    if (!id || !action) {
      return NextResponse.json(
        { error: "id and action (approve|reject) are required" },
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
      .select("id, review_status")
      .eq("id", id)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!existing) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const patch =
      action === "approve"
        ? buildApproveCandidatePatch(existing)
        : buildRejectCandidatePatch(existing, rejectReason);

    const {
      publish: _publish,
      enrich: _enrich,
      insert_into_films: _insert,
      catalog_visible: _visible,
      ...dbPatch
    } = patch as Record<string, unknown>;

    const { data: updated, error: updateError } = await supabase
      .from("film_discovery_candidates")
      .update(dbPatch)
      .eq("id", id)
      .eq("review_status", DISCOVERY_REVIEW_STATUS.pendingReview)
      .select("id, review_status, reject_reason, reviewed_at")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json(
        { error: "Candidate was already reviewed" },
        { status: 409 }
      );
    }

    if (action === "approve") {
      const { data: fullCandidate, error: fullError } = await supabase
        .from("film_discovery_candidates")
        .select("*")
        .eq("id", id)
        .single();
      if (fullError) throw fullError;

      const release = await enqueueDiscoveryCandidateForRelease(
        supabase,
        fullCandidate
      );

      const queueId =
        typeof release.queueId === "string" ? release.queueId : null;
      const shouldPrep =
        Boolean(queueId) &&
        release.status !== "blocked" &&
        release.status !== "failed";

      if (shouldPrep && queueId) {
        after(async () => {
          try {
            await runDiscoveryReleasePrepForQueueId(supabase, queueId);
          } catch (error) {
            console.error("[discovery-release-prep] after(Approve) failed", {
              queueId,
              candidateId: id,
              error,
            });
          }
        });
      }

      const { data: afterRelease } = await supabase
        .from("film_discovery_candidates")
        .select(
          "id, review_status, reject_reason, reviewed_at, release_status, release_queue_id, release_blockers"
        )
        .eq("id", id)
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        candidate: afterRelease ?? updated,
        release: {
          status: release.status,
          queueId: release.queueId,
          blockers: release.blockers,
          warnings: release.warnings,
          catalogNote: release.catalogNote,
          prepStarted: shouldPrep,
        },
        effects: {
          published: false,
          enriched: false,
          inserted_into_films: false,
          catalog_visible: false,
          queued_for_release: release.status !== "blocked",
          prep_started: shouldPrep,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      candidate: updated,
      effects: {
        published: false,
        enriched: false,
        inserted_into_films: false,
        catalog_visible: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
