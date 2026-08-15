import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import { runWeeklyFilmImport } from "@/lib/film-import-queue.mjs";
import { processFilmImportBatch } from "@/scripts/process-film-batch.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Manual/recovery prep runner (in-process — no detached spawn).
 * Normal path: Approve kicks prep via after().
 */
export async function POST(request: Request) {
  const access = await requireAdminApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const batchSizeRaw = Number(body.batch_size ?? 5);
    const batchSize =
      Number.isInteger(batchSizeRaw) && batchSizeRaw >= 1 && batchSizeRaw <= 50
        ? batchSizeRaw
        : 5;

    const supabase = getAdminSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: "Admin Supabase is not configured" },
        { status: 500 }
      );
    }

    const outcome = await runWeeklyFilmImport({
      supabase,
      processFilmImportBatch,
      sendEmail: null,
      options: {
        batchSize,
        dryRun: false,
        skipEmail: true,
      },
    });

    return NextResponse.json({
      ok: true,
      started: true,
      in_process: true,
      batch_size: batchSize,
      runStatus: outcome.report?.runStatus ?? null,
      successCount: outcome.report?.successCount ?? 0,
      failedCount: outcome.report?.failedCount ?? 0,
      message:
        "Prep finished in-process (same weekly import orchestrator). Refresh the page.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Process prep failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
