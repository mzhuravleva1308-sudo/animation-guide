/**
 * Live-action material fact for FilmCard header pills.
 * Format: "Object. Place" — simple concrete nouns, no mood, no viewing instructions.
 */

export const MATERIAL_FACT_MAX_OBJECT_CHARS = 48;
export const MATERIAL_FACT_MAX_PLACE_CHARS = 40;

const PLACEHOLDER_FACTS = new Set([
  "object. place",
  "object.place",
  "thing. place",
  "a thing. a place",
]);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeMaterialFact(value) {
  if (value == null) return null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (PLACEHOLDER_FACTS.has(trimmed.toLowerCase().replace(/\.+$/, ""))) {
    return null;
  }

  const parsed = parseMaterialFactParts(trimmed);
  if (!parsed) return null;

  const objectKey = parsed.object.toLowerCase();
  const placeKey = parsed.place.toLowerCase();
  if (objectKey === "object" || placeKey === "place") return null;

  return formatMaterialFact(parsed.object, parsed.place);
}

/**
 * @param {string} object
 * @param {string} place
 * @returns {string}
 */
export function formatMaterialFact(object, place) {
  const o = String(object ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "");
  const p = String(place ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "");
  return `${o}. ${p}`;
}

/**
 * @param {unknown} value
 * @returns {{ object: string, place: string } | null}
 */
export function parseMaterialFactParts(value) {
  const raw = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!raw) return null;

  const match = raw.match(/^(.+?)\.\s+(.+?)\.?$/);
  if (!match) return null;

  const object = match[1].trim().replace(/\.+$/, "");
  const place = match[2].trim().replace(/\.+$/, "");
  if (!object || !place) return null;
  if (object.length > MATERIAL_FACT_MAX_OBJECT_CHARS) return null;
  if (place.length > MATERIAL_FACT_MAX_PLACE_CHARS) return null;

  return { object, place };
}

/**
 * Card label: "Object · Place" (single pill; CSS may uppercase).
 * @param {unknown} value
 * @returns {string[]}
 */
export function getMaterialFactPills(value) {
  const normalized = normalizeMaterialFact(value);
  if (!normalized) return [];
  const parts = parseMaterialFactParts(normalized);
  if (!parts) return [];
  return [`${parts.object} · ${parts.place}`];
}

/**
 * @param {object} film
 */
export function buildMaterialFactPrompt(film) {
  return `
You write ONE material fact line for a live-action film card header.

Goal: a simple concrete "Object. Place" fact that lets the viewer touch the film's world.
Not mood. Not genre. Not how to watch. Not what you will feel. Not awards. Not technique.

Format rules (strict):
- Exactly two parts separated by a period+space: "<thing>. <place>"
- Thing = one tangible object or setting piece you could point to in the film.
- Place = city, region, island, country, or short locale (keep short).
- Plain, material, factual. Prefer concrete nouns over adjectives.
- NEVER return the words "Object" or "Place" as the values.
- NEVER copy the template literally.
- No verbs telling the viewer what to do.
- No emotional words (tender, haunting, intimate, melancholic, etc.).
- No poetic lists of sensations (no "cicadas, coffee, light").
- English. Prefer sentence case for the thing ("Public toilets").
- Thing max ${MATERIAL_FACT_MAX_OBJECT_CHARS} characters; place max ${MATERIAL_FACT_MAX_PLACE_CHARS}.

Good examples of material_fact:
- "Public toilets. Tokyo"
- "Oil paint. An island"
- "The sea. Florida"
- "A wooden cross. Iceland"
- "A well. Outside Seoul"

Bad examples (never output these):
- "Object. Place"
- "live action"
- "Soft muted urban"
- "Stay with the routine"
- "Cicadas, canned coffee, early light"
- "A story of loneliness in Tokyo"

Film:
Title: ${film.title ?? ""}
Original title: ${film.original_title ?? ""}
Year: ${film.year ?? ""}
Director: ${film.director ?? ""}
Country: ${film.country ?? ""}
Synopsis: ${film.synopsis ?? ""}
The mood sentence (do not copy tone into the fact): ${film.the_mood ?? ""}

Return only JSON with concrete values for THIS film:
{
  "material_fact": "<thing>. <place>",
  "object": "<thing>",
  "place": "<place>"
}
`.trim();
}
