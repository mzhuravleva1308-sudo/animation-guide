/**
 * Normalize a free-form vibe query into an English mood phrase
 * before embedding against film_mood_embeddings.
 */

import {
  buildVibeQueryNormalizePrompt,
  cleanNormalizedVibePhrase,
} from "./vibe-search.mjs";

/**
 * @param {import("openai").default} openai
 * @param {string} query
 * @param {{ model?: string }} [options]
 * @returns {Promise<{ englishPhrase: string, translated: boolean }>}
 */
export async function normalizeVibeQueryToEnglish(openai, query, options = {}) {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) {
    return { englishPhrase: "", translated: false };
  }

  const response = await openai.chat.completions.create({
    model: options.model ?? process.env.OPENAI_VIBE_NORMALIZE_MODEL ?? "gpt-4o-mini",
    temperature: 0,
    max_tokens: 60,
    messages: [
      {
        role: "system",
        content:
          "You normalize film-feeling search queries into short English mood phrases.",
      },
      {
        role: "user",
        content: buildVibeQueryNormalizePrompt(trimmed),
      },
    ],
  });

  const englishPhrase = cleanNormalizedVibePhrase(
    response.choices[0]?.message?.content,
    trimmed
  );

  return {
    englishPhrase,
    translated: englishPhrase.toLowerCase() !== trimmed.toLowerCase(),
  };
}
