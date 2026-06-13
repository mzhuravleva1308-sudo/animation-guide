import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase";
import { Film } from "@/types/film";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type RatingRow = {
  film_id: string;
  rating: number | null;
};

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);

  const slug = searchParams.get("slug");
  const token = searchParams.get("token");

  if (!slug || !token) {
    return NextResponse.json(
      { error: "Missing profile slug or token" },
      { status: 400 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("share_token", token)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "Profile not found" },
      { status: 404 }
    );
  }

  const { data: ratingsData, error: ratingsError } = await supabase
    .from("film_ratings")
    .select("film_id, rating")
    .eq("profile_id", profile.id);

  if (ratingsError) {
    return NextResponse.json(
      { error: "Could not load ratings" },
      { status: 500 }
    );
  }

  const ratings = (ratingsData as RatingRow[] | null) ?? [];

  const ratedFilmIds = ratings
    .filter((item) => item.rating !== null)
    .map((item) => item.film_id);

  if (ratedFilmIds.length < 3) {
    return NextResponse.json(
      { error: "Not enough rated films to generate a taste profile" },
      { status: 400 }
    );
  }

  const { data: filmsData, error: filmsError } = await supabase
    .from("films")
    .select("*")
    .in("id", ratedFilmIds);

  if (filmsError) {
    return NextResponse.json(
      { error: "Could not load films" },
      { status: 500 }
    );
  }

  const films = (filmsData as Film[] | null) ?? [];

  const ratingByFilmId = new Map(
    ratings
      .filter((item) => item.rating !== null)
      .map((item) => [item.film_id, item.rating as number])
  );

  const ratedFilms = films
    .map((film) => ({
      title: film.title,
      year: film.year,
      director: film.director,
      rating: ratingByFilmId.get(film.id),
      technique: film.technique,
      moods: film.moods,
      themes: film.themes,
      synopsis: film.synopsis,
    }))
    .filter((film) => film.rating !== undefined)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  const prompt = `
You are generating a taste profile for ${profile.name} based on their rated animated films.

Write as if the app is gently reflecting what it has learned about their taste.
Do not mention film titles.
Do not quote evidence.
Do not sound academic, analytical, formal, or like a professor.
Do not use phrases like "reveals", "showcases", "demonstrates", "deep appreciation", "narratives", "themes of", or "as seen in".
Do not write a list of tags.

Write in a warm, intimate, clear voice.
Make it feel like quiet knowledge, not a report.

Be specific, but do not overclaim.
Focus on:
- emotional tone
- visual feeling
- what kind of worlds they seem drawn to
- what may be less central to their taste

Use 2 short paragraphs, 3-5 sentences total.
Mention once that this is a living hypothesis based on their ratings.

Rated films:
${JSON.stringify(ratedFilms, null, 2)}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You write warm, concise taste insights for a personal animation guide. Your tone is human, observant, and soft — never academic, never formal, never like a review.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
  });

  const tasteProfile =
    completion.choices[0]?.message?.content?.trim() ??
    "The system could not generate a taste profile yet.";

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      taste_profile: tasteProfile,
      taste_profile_updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Could not save taste profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    tasteProfile,
  });
}