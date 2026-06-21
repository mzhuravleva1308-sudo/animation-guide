import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const inputText = String(body.inputText || "").trim();

    if (!inputText) {
      return NextResponse.json(
        { error: "Input text is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const response = await client.responses.create({
    model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: `
You extract structured data about independent animated short films.

Return ONLY valid JSON. No markdown. No comments.

The JSON must match this shape:
{
  "title": string,
  "original_title": string | null,
  "director": string | null,
  "year": number | null,
  "country": string | null,
  "duration_minutes": number | null,
  "festival": string | null,
  "section": string | null,
  "source_url": string | null,
  "watch_url": string | null,
  "trailer_url": string | null,
  "availability": "unknown" | "available" | "trailer_only" | "festival_only",
  "synopsis": string | null,
  "technique": string | null,
  "moods": string[],
  "themes": string[],
  "dialogue": "unknown" | "no_dialogue" | "has_dialogue" | "minimal_dialogue",
  "emotional_intensity": number | null,
  "weirdness": number | null,
  "kid_safety": "unknown" | "yes" | "maybe" | "no",
  "why_i_might_like_it": string | null,
  "what_it_is": string | null,
  "the_mood": string | null,
  "personal_note": string | null,
  "status": "want_to_watch"
}

Rules:
- Do not invent factual data if it is not present.
- For uncertain factual fields, use null or "unknown".
- Mood/theme/taste fields may be inferred from the synopsis, but keep them modest.
- emotional_intensity and weirdness are integers from 1 to 5.
- why_i_might_like_it should be one short taste-based note, not a generic synopsis.
- what_it_is and the_mood may be null on import; leave null unless clearly inferable from the source text.
- Use English tags.
          `.trim(),
        },
        {
          role: "user",
          content: inputText,
        },
      ],
    });

    const text = response.output_text;

    let draft;

    try {
      draft = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          error: "The model returned invalid JSON",
          raw: text,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ draft });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}