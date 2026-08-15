import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import { goLiveFilmBatch } from "@/lib/film-release-go-live.mjs";

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
    const filmIds = Array.isArray(body.film_ids)
      ? body.film_ids.filter((id: unknown) => typeof id === "string")
      : [];
    const notes = typeof body.notes === "string" ? body.notes : null;

    if (!filmIds.length) {
      return NextResponse.json(
        { error: "film_ids (non-empty string[]) is required" },
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

    const result = await goLiveFilmBatch(supabase, filmIds, {
      actor: "admin",
      notes,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Go live failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
