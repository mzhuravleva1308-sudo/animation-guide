import { parseFilmFestivalRecognitionInputs } from "./film-festival-recognition.mjs";

export const AI_FESTIVAL_WINNERS_MODEL = "gpt-4o-mini";
export const AI_FESTIVAL_WINNERS_SOURCE = "ai_festival_winners_v1";

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null, director?: string | null, country?: string | null }} film
 */
export function buildAiFestivalWinnersPrompt(film) {
  return `
Find concrete awards actually won by this animated film.

Film metadata:
- Title: ${film.title}
- Original title: ${film.original_title ?? "unknown"}
- Year: ${film.year ?? "unknown"}
- Director: ${film.director ?? "unknown"}
- Country: ${film.country ?? "unknown"}

Return ONLY valid JSON in this exact shape:

{
  "recognitions": [
    {
      "festival_name": string,
      "festival_year": number | null,
      "section": string | null,
      "recognition_type": "award",
      "award_name": string,
      "award_result": "winner",
      "source_url": string | null,
      "source_label": string | null,
      "original_text": string | null
    }
  ]
}

Rules:
- Include awards actually won by this specific film.
- Include festival prizes, film-academy prizes, and animation awards.
- Include the concrete festival or awarding body and the most specific award name you know.
- Do NOT include official selections, screenings, premieres, nominations, shortlists, submissions, markets, or awards won by another film from the same director.
- Return an empty recognitions array when no concrete award win is known.
- Do not invent awards, years, or sources.
`.trim();
}

/**
 * @param {unknown} payload
 */
export function parseAiFestivalWinners(payload) {
  const recognitions =
    payload &&
    typeof payload === "object" &&
    Array.isArray(payload.recognitions)
      ? payload.recognitions
      : [];

  const enriched = recognitions.map((recognition) => ({
    ...recognition,
    recognition_type: "award",
    import_source: AI_FESTIVAL_WINNERS_SOURCE,
    import_key: `ai-winner-${String(
      recognition.festival_name ?? "unknown"
    ).toLowerCase()}-${recognition.festival_year ?? "unknown"}-${String(
      recognition.award_name ?? "award"
    ).toLowerCase()}`,
    source_type: "ai_inference",
    source_label:
      recognition.source_label ?? "OpenAI festival awards discovery",
  }));

  return parseFilmFestivalRecognitionInputs(enriched, {
    path: "recognitions",
  });
}

/**
 * @param {import("openai").OpenAI} client
 * @param {{ title: string, original_title?: string | null, year?: number | null, director?: string | null, country?: string | null }} film
 */
export async function extractAiFestivalWinners(client, film) {
  const response = await client.responses.create({
    model: AI_FESTIVAL_WINNERS_MODEL,
    input: [
      {
        role: "system",
        content:
          "You identify concrete awards won by animated films. Return only valid JSON. Never include selections, nominations, screenings, premieres, markets, or uncertain claims.",
      },
      {
        role: "user",
        content: buildAiFestivalWinnersPrompt(film),
      },
    ],
  });

  let payload;

  try {
    payload = JSON.parse(response.output_text);
  } catch {
    return { ok: true, value: [] };
  }

  return parseAiFestivalWinners(payload);
}