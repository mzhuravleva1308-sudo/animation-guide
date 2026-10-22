import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { VIBE_HIDDEN_LIST_TYPE } from "@/lib/vibe-hidden.mjs";
import { normalizeFilms } from "@/lib/normalize-film";
import type { Film } from "@/types/film";

export const runtime = "nodejs";

const MAX_NOTE_LENGTH = 280;

const FILM_SELECT = [
  "id",
  "title",
  "original_title",
  "director",
  "year",
  "country",
  "duration_minutes",
  "poster_url",
  "image_url",
  "trailer_url",
  "availability",
  "synopsis",
  "what_it_is",
  "the_mood",
  "technique",
  "material_fact",
  "media_type",
  "moods",
  "aesthetic_tags",
  "narrative_tags",
].join(", ");

function normalizeNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_NOTE_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

async function requireAuthenticatedProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  const admin = getAdminSupabase();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      error: NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      ),
    };
  }

  if (!profile?.id) {
    return {
      error: NextResponse.json({ error: "Profile required" }, { status: 400 }),
    };
  }

  return { admin, profileId: profile.id as string };
}

export async function GET() {
  try {
    const resolved = await requireAuthenticatedProfile();
    if ("error" in resolved && resolved.error) return resolved.error;

    const { admin, profileId } = resolved as {
      admin: ReturnType<typeof getAdminSupabase>;
      profileId: string;
    };

    type HiddenRow = {
      film_id: string;
      note?: string | null;
      created_at?: string;
    };

    let rows: HiddenRow[] = [];
    {
      const withNote = await admin
        .from("profile_film_lists")
        .select("film_id, note, created_at")
        .eq("profile_id", profileId)
        .eq("list_type", VIBE_HIDDEN_LIST_TYPE)
        .order("created_at", { ascending: false });

      if (withNote.error && /note/i.test(withNote.error.message)) {
        const withoutNote = await admin
          .from("profile_film_lists")
          .select("film_id, created_at")
          .eq("profile_id", profileId)
          .eq("list_type", VIBE_HIDDEN_LIST_TYPE)
          .order("created_at", { ascending: false });

        if (withoutNote.error) {
          return NextResponse.json(
            { error: withoutNote.error.message },
            { status: 500 }
          );
        }
        rows = (withoutNote.data ?? []) as HiddenRow[];
      } else if (withNote.error) {
        return NextResponse.json(
          { error: withNote.error.message },
          { status: 500 }
        );
      } else {
        rows = (withNote.data ?? []) as HiddenRow[];
      }
    }

    const filmIds = rows.map((row) => row.film_id).filter(Boolean);
    if (!filmIds.length) {
      return NextResponse.json({ filmIds: [], items: [], count: 0 });
    }

    const noteByFilmId = new Map(
      rows.map((row) => [row.film_id, normalizeNote(row.note)])
    );

    const { data: films, error: filmsError } = await admin
      .from("films")
      .select(FILM_SELECT)
      .in("id", filmIds);

    if (filmsError) {
      return NextResponse.json({ error: filmsError.message }, { status: 500 });
    }

    const filmById = new Map(
      normalizeFilms((films as unknown as Film[] | null) ?? []).map((film) => [
        film.id,
        film,
      ])
    );

    const items = filmIds
      .map((id) => {
        const film = filmById.get(id);
        if (!film) return null;
        return {
          film,
          note: noteByFilmId.get(id) ?? null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      filmIds,
      items,
      // Back-compat for early UI that only read `films`.
      films: items.map((item) => item!.film),
      count: items.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const resolved = await requireAuthenticatedProfile();
    if ("error" in resolved && resolved.error) return resolved.error;

    const { admin, profileId } = resolved as {
      admin: ReturnType<typeof getAdminSupabase>;
      profileId: string;
    };

    let body: { filmId?: string; hidden?: boolean; note?: string | null };
    try {
      body = (await request.json()) as {
        filmId?: string;
        hidden?: boolean;
        note?: string | null;
      };
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { filmId, hidden } = body;
    const note = normalizeNote(body.note);

    if (!filmId || typeof hidden !== "boolean") {
      return NextResponse.json({ error: "Invalid hide request" }, { status: 400 });
    }

    if (hidden) {
      const { data: existing, error: existingError } = await admin
        .from("profile_film_lists")
        .select("id")
        .eq("profile_id", profileId)
        .eq("film_id", filmId)
        .eq("list_type", VIBE_HIDDEN_LIST_TYPE)
        .maybeSingle();

      if (existingError) {
        return NextResponse.json(
          { error: existingError.message },
          { status: 500 }
        );
      }

      if (existing) {
        let { error } = await admin
          .from("profile_film_lists")
          .update({ note })
          .eq("id", existing.id);

        if (error && /note/i.test(error.message)) {
          // Column missing — hide still succeeded via existing row.
          error = null;
        }

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      } else {
        let { error } = await admin.from("profile_film_lists").insert({
          profile_id: profileId,
          film_id: filmId,
          list_type: VIBE_HIDDEN_LIST_TYPE,
          note,
        });

        if (error && /note/i.test(error.message)) {
          ({ error } = await admin.from("profile_film_lists").insert({
            profile_id: profileId,
            film_id: filmId,
            list_type: VIBE_HIDDEN_LIST_TYPE,
          }));
        }

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    } else {
      const { error } = await admin
        .from("profile_film_lists")
        .delete()
        .eq("profile_id", profileId)
        .eq("film_id", filmId)
        .eq("list_type", VIBE_HIDDEN_LIST_TYPE);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ filmId, hidden, note: hidden ? note : null });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
