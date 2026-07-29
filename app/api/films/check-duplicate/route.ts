import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiAccess } from "@/lib/auth/require-admin";
import {
  findFilmDuplicates,
  shouldBlockInsert,
} from "@/lib/film-duplicate-check";
import { fetchDuplicateCandidates } from "@/lib/insert-film.mjs";
import type { FilmIdentity } from "@/lib/film-duplicate-check";

function getAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: Request) {
  const access = await requireAdminApiAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const body = await request.json();
    const incoming = body.film as FilmIdentity | undefined;

    if (!incoming?.title?.trim()) {
      return NextResponse.json({ error: "Film title is required" }, { status: 400 });
    }

    const adminSupabase = getAdminSupabase();
    if (!adminSupabase) {
      return NextResponse.json(
        { error: "Duplicate check is not configured" },
        { status: 500 }
      );
    }

    const candidates = await fetchDuplicateCandidates(adminSupabase, incoming);
    const matches = findFilmDuplicates(incoming, candidates);
    const blockResult = shouldBlockInsert(matches, {
      allowPossibleDuplicates: Boolean(body.allowPossibleDuplicates),
      forceExactDuplicate: Boolean(body.forceExactDuplicate),
    });

    return NextResponse.json({
      incomingFilm: incoming,
      matches,
      blocked: blockResult.blocked,
      reason: blockResult.reason,
    });
  } catch {
    return NextResponse.json(
      { error: "Duplicate check failed" },
      { status: 500 }
    );
  }
}
