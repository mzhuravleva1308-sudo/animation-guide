/**
 * Animation Plot Charge — free-form story-hook field (films.plot_charge).
 *
 * Independent of storytelling_tags (controlled plot situations).
 * Answers: what unfolds that gives the story its charge — process, not mood/visual.
 *
 * Stored shape:
 *   { headline: string, charge_lines: string[], confidence?: "high"|"medium"|"low" }
 */

export const PLOT_CHARGE_LINES_MIN = 2;
export const PLOT_CHARGE_LINES_MAX = 4;

/** Default 20-title pilot set (same as early Story Charge review). */
export const PLOT_CHARGE_PILOT_TITLES = Object.freeze([
  "Flow",
  "Robot Dreams",
  "Mary and Max",
  "Wolf Children",
  "The Red Turtle",
  "Coraline",
  "Spirited Away",
  "My Life as a Courgette",
  "Fantastic Mr. Fox",
  "Persepolis",
  "The Colors Within",
  "American Pop",
  "Padak",
  "Anomalisa",
  "Corpse Bride",
  "Unicorn Wars",
  "A Boat in the Garden",
  "The Breadwinner",
  "Ernest & Celestine",
  "The Summit of the Gods",
]);

/**
 * @param {unknown} value
 * @returns {{ headline: string, charge_lines: string[], confidence: "high"|"medium"|"low" } | null}
 */
/**
 * @param {string} text
 * @returns {string}
 */
function cleanChargeSentence(text) {
  let s = String(text ?? "")
    .trim()
    .replace(/\s+/g, " ")
    // Collapse leftover arrow schemas into readable prose separators.
    .replace(/\s*→\s*/g, ", then ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!s) return "";
  if (!/[.!?]$/.test(s)) s = `${s}.`;
  return s;
}

export function normalizePlotCharge(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const headline = cleanChargeSentence(value.headline);
  const charge_lines = (Array.isArray(value.charge_lines) ? value.charge_lines : [])
    .map((line) => cleanChargeSentence(line))
    .filter(Boolean)
    .slice(0, PLOT_CHARGE_LINES_MAX);
  if (!headline || charge_lines.length < PLOT_CHARGE_LINES_MIN) return null;
  const confidence = ["high", "medium", "low"].includes(value.confidence)
    ? value.confidence
    : "medium";
  return { headline, charge_lines, confidence };
}

/**
 * Single string suitable for embedding experiments (not production ranking yet).
 * @param {{ headline?: string, charge_lines?: string[] } | null | undefined} charge
 * @returns {string | null}
 */
export function formatPlotChargeForEmbedding(charge) {
  const normalized = normalizePlotCharge(charge);
  if (!normalized) return null;
  return `plot charge: ${normalized.headline} | ${normalized.charge_lines.join(" | ")}`;
}

/**
 * @param {object} film
 */
export function buildAnimationPlotChargePrompt(film) {
  return `
You write a Plot Charge card for an animated film in a multi-viewer recommendation catalog.

Plot Charge = what unfolds that gives the story its hook — the developing process that could matter to *someone*.
NOT mood. NOT visual craft. NOT evaluative praise. NOT a full synopsis retelling.

Write cause→effect as normal English sentences (process language), not outline notation.
Good: "Shared danger forces mutual dependence, and trust grows under that pressure."
Bad: "Shared danger → mutual dependence → trust"
Never use arrow chains (→), slash-step outlines, or telegraphic schema lines.

Rules:
- 1 headline + ${PLOT_CHARGE_LINES_MIN}–${PLOT_CHARGE_LINES_MAX} short charge lines.
- Every headline and charge line must be a full sentence (subject + verb), ending with a period.
- Concrete and film-specific; avoid universal clichés unless made distinctive.
- Do not invent unsupported events.
- Prefer the distinctive engine over generic "friendship develops / trauma heals".
- Independent of any plot tags we already store.

Film:
Title: ${film.title ?? ""}
Year: ${film.year ?? ""}
Director: ${film.director ?? ""}
Synopsis: ${film.synopsis ?? ""}
What it is: ${film.what_it_is ?? ""}
The mood (do not copy as charge): ${film.the_mood ?? ""}
Plot tags (context only, do not copy verbatim): ${(film.storytelling_tags ?? []).join(", ")}

Return only JSON:
{
  "headline": "One sentence central charge.",
  "charge_lines": ["...", "..."],
  "confidence": "high|medium|low"
}
`.trim();
}
