import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";

/**
 * Kick the existing weekly import orchestrator for pending prep items.
 * Runs out-of-process so the HTTP request does not block on OpenAI/TMDB.
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

    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "run-weekly-film-import.mjs"
    );

    const child = spawn(
      process.execPath,
      [scriptPath, "--batch-size", String(batchSize), "--skip-email"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APP_ENV: process.env.APP_ENV || "hosted",
        },
        detached: true,
        stdio: "ignore",
      }
    );
    child.unref();

    return NextResponse.json({
      ok: true,
      started: true,
      batch_size: batchSize,
      pid: child.pid ?? null,
      message:
        "Prep import started in background (same weekly import orchestrator). Refresh this page in a few minutes.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Process prep failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
