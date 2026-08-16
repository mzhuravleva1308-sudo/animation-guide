import { NextResponse } from "next/server";
import { rebuildAestheticTasteCoresForProfile } from "@/scripts/build-aesthetic-cores.mjs";
import { rebuildEmotionalTasteCoresForProfile } from "@/scripts/build-taste-cores.mjs";
import {
  calculateAllProfileScoreArtifacts,
  getAllFilms,
} from "@/scripts/rebuild-profile-film-scores.mjs";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getAdminSupabase();
  const { data: jobs, error: claimError } = await supabase.rpc(
    "claim_profile_score_rebuild_jobs",
    { requested_limit: 1 }
  );

  if (claimError) {
    console.error("[profile-score-worker] failed to claim jobs", claimError);
    return NextResponse.json(
      { error: "Could not claim profile score jobs" },
      { status: 500 }
    );
  }

  if (!jobs?.length) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;
  let stale = 0;

  for (const job of jobs) {
    try {
      const allFilms = await getAllFilms();
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, slug, name")
        .eq("id", job.profile_id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      // Rebuild taste cores before scores so native ranking uses fresh profile tags.
      // Same trigger path as animation: film_ratings → score job → worker.
      if (profile) {
        await rebuildEmotionalTasteCoresForProfile(profile);
        await rebuildAestheticTasteCoresForProfile(profile);
      }

      const scoreRows = profile
        ? await calculateAllProfileScoreArtifacts(profile, allFilms, {
            quiet: true,
          })
        : [];
      const { data: applied, error: applyError } = await supabase.rpc(
        "replace_profile_film_scores_if_current",
        {
          job_profile_id: job.profile_id,
          job_generation: job.generation,
          score_rows: scoreRows,
        }
      );

      if (applyError) {
        throw applyError;
      }

      if (!applied) {
        stale += 1;
        continue;
      }

      processed += 1;
    } catch (error) {
      console.error("[profile-score-worker] rebuild failed", {
        profileId: job.profile_id,
        error,
      });

      const { error: failError } = await supabase.rpc(
        "fail_profile_score_rebuild_job",
        {
          job_profile_id: job.profile_id,
          job_generation: job.generation,
          error_message: error instanceof Error ? error.message : String(error),
        }
      );

      if (failError) {
        console.error("[profile-score-worker] failed to reschedule job", failError);
      }
    }
  }

  return NextResponse.json({ processed, stale });
}
