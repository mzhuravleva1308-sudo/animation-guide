import OpenAI from "openai";
import {
  buildOpenAiFestivalExtractionPrompt,
  parseWikipediaExtractionCandidates,
} from "./backfill-film-festival-recognitions.mjs";

/**
 * @param {import("openai").OpenAI} client
 * @param {{ title: string, original_title?: string | null, year?: number | null, director?: string | null, festival?: string | null, section?: string | null }} film
 * @param {{ title: string, url: string, extract: string }} wikipedia
 */
export async function extractWikipediaFestivalCandidates(client, film, wikipedia) {
  const prompt = buildOpenAiFestivalExtractionPrompt(film, wikipedia);
  const response = await client.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "You extract conservative festival candidate facts from source text. Return only JSON.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  let payload;
  try {
    payload = JSON.parse(response.output_text);
  } catch {
    return [];
  }

  return parseWikipediaExtractionCandidates(payload);
}

/** @deprecated Use extractWikipediaFestivalCandidates */
export const extractFestivalRecognitionsFromWikipedia = extractWikipediaFestivalCandidates;
