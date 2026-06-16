import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
  try {
    const body = await request.json();
    const incoming = body.film as FilmIdentity | undefined;

    if (!incoming?.title?.trim()) {
      return NextResponse.json({ error: "Film title is required" }, { status: 400 });
    }

    const adminSupabase = getAdminSupabase();
    if (!adminSupabase) {
      return NextResponse.json(
        { error: "Missing Supabase admin configuration" },
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
