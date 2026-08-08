/**
 * Resonale major festivals canon — Festival filter / participation only.
 * Oscar-qualifying alone does NOT make a festival major.
 * Source of truth for discovery staging + AI festival participation prompts.
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   group: "animation" | "international" | "genre" | "other_international",
 *   country?: string,
 *   matchKeys: string[],
 *   notes?: string,
 * }} ResonaleMajorFestival
 */

/** @type {readonly ResonaleMajorFestival[]} */
export const RESONALE_MAJOR_FESTIVALS = Object.freeze([
  // Animation
  {
    id: "annecy",
    name: "Annecy International Animation Film Festival",
    group: "animation",
    country: "France",
    matchKeys: ["annecy"],
  },
  {
    id: "ottawa",
    name: "Ottawa International Animation Festival",
    group: "animation",
    country: "Canada",
    matchKeys: ["ottawa international animation", "ottawa animation"],
  },
  {
    id: "animafest-zagreb",
    name: "Animafest Zagreb",
    group: "animation",
    country: "Croatia",
    matchKeys: ["animafest zagreb", "animafest"],
  },
  {
    id: "itfs-stuttgart",
    name: "Stuttgart International Festival of Animated Film (ITFS)",
    group: "animation",
    country: "Germany",
    matchKeys: ["stuttgart international festival of animated", "itfs", "stuttgart animated"],
  },
  {
    id: "anifilm",
    name: "Anifilm",
    group: "animation",
    country: "Czech Republic",
    matchKeys: ["anifilm"],
  },
  {
    id: "fantoche",
    name: "Fantoche",
    group: "animation",
    country: "Switzerland",
    matchKeys: ["fantoche"],
  },
  {
    id: "anima-brussels",
    name: "Anima Brussels",
    group: "animation",
    country: "Belgium",
    matchKeys: ["anima brussels", "anima festival brussels"],
  },
  {
    id: "kaboom",
    name: "Kaboom Animation Festival",
    group: "animation",
    country: "Netherlands",
    matchKeys: ["kaboom animation"],
  },
  {
    id: "anima-mundi",
    name: "Anima Mundi",
    group: "animation",
    country: "Brazil",
    matchKeys: ["anima mundi"],
  },
  {
    id: "hiroshima",
    name: "Hiroshima Animation Season",
    group: "animation",
    country: "Japan",
    matchKeys: [
      "hiroshima animation season",
      "hiroshima international animation",
      "hiroshima animation festival",
    ],
    notes:
      "Includes historical Hiroshima International Animation Festival for older films.",
  },
  {
    id: "cinanima",
    name: "CINANIMA",
    group: "animation",
    country: "Portugal",
    matchKeys: ["cinanima"],
  },

  // International A-list / major
  {
    id: "cannes",
    name: "Cannes Film Festival",
    group: "international",
    country: "France",
    matchKeys: ["cannes film festival", "festival de cannes", "cannes"],
    notes:
      "Count Official Selection, Un Certain Regard, Cannes Première / Special Screenings, Critics’ Week / Semaine de la Critique, Directors’ Fortnight / Quinzaine. Do NOT count Marché du Film, Shorts Corner, pitch, or WIP.",
  },
  {
    id: "berlinale",
    name: "Berlin International Film Festival",
    group: "international",
    country: "Germany",
    matchKeys: ["berlin international film festival", "berlinale"],
  },
  {
    id: "venice",
    name: "Venice International Film Festival",
    group: "international",
    country: "Italy",
    matchKeys: [
      "venice international film festival",
      "venice film festival",
      "mostra internazionale d'arte cinematografica",
      "venice",
    ],
  },
  {
    id: "locarno",
    name: "Locarno Film Festival",
    group: "international",
    country: "Switzerland",
    matchKeys: ["locarno"],
  },
  {
    id: "tiff",
    name: "Toronto International Film Festival",
    group: "international",
    country: "Canada",
    matchKeys: ["toronto international film festival", "tiff"],
  },
  {
    id: "sundance",
    name: "Sundance Film Festival",
    group: "international",
    country: "United States",
    matchKeys: ["sundance"],
  },
  {
    id: "iffr",
    name: "International Film Festival Rotterdam",
    group: "international",
    country: "Netherlands",
    matchKeys: ["international film festival rotterdam", "iffr", "rotterdam film festival"],
  },
  {
    id: "san-sebastian",
    name: "San Sebastián International Film Festival",
    group: "international",
    country: "Spain",
    matchKeys: ["san sebastian", "san sebastián", "donostia"],
  },
  {
    id: "karlovy-vary",
    name: "Karlovy Vary International Film Festival",
    group: "international",
    country: "Czech Republic",
    matchKeys: ["karlovy vary"],
  },
  {
    id: "busan",
    name: "Busan International Film Festival",
    group: "international",
    country: "South Korea",
    matchKeys: ["busan international film festival", "biff", "busan"],
  },
  {
    id: "tokyo-iff",
    name: "Tokyo International Film Festival",
    group: "international",
    country: "Japan",
    matchKeys: ["tokyo international film festival"],
  },
  {
    id: "tallinn-pono",
    name: "Tallinn Black Nights Film Festival",
    group: "international",
    country: "Estonia",
    matchKeys: ["tallinn black nights", "poff", "black nights film festival"],
  },
  {
    id: "warsaw",
    name: "Warsaw International Film Festival",
    group: "international",
    country: "Poland",
    matchKeys: ["warsaw international film festival", "warsaw film festival"],
  },

  // Genre / fantastic
  {
    id: "sitges",
    name: "Sitges International Fantastic Film Festival",
    group: "genre",
    country: "Spain",
    matchKeys: ["sitges"],
  },
  {
    id: "fantasia",
    name: "Fantasia International Film Festival",
    group: "genre",
    country: "Canada",
    matchKeys: ["fantasia international", "fantasia film festival", "fantasia montreal"],
  },
  {
    id: "bifan",
    name: "Bucheon International Fantastic Film Festival",
    group: "genre",
    country: "South Korea",
    matchKeys: ["bucheon international fantastic", "bifan"],
  },
  {
    id: "fantastic-fest",
    name: "Fantastic Fest",
    group: "genre",
    country: "United States",
    matchKeys: ["fantastic fest"],
  },

  // Other large internationals
  {
    id: "bfi-london",
    name: "BFI London Film Festival",
    group: "other_international",
    country: "United Kingdom",
    matchKeys: ["bfi london", "london film festival"],
  },
  {
    id: "melbourne",
    name: "Melbourne International Film Festival",
    group: "other_international",
    country: "Australia",
    matchKeys: ["melbourne international film festival", "miff"],
  },
  {
    id: "sydney",
    name: "Sydney Film Festival",
    group: "other_international",
    country: "Australia",
    matchKeys: ["sydney film festival"],
  },
  {
    id: "gijon",
    name: "Gijón International Film Festival",
    group: "other_international",
    country: "Spain",
    matchKeys: ["gijon", "gijón"],
  },
  {
    id: "sao-paulo",
    name: "São Paulo International Film Festival",
    group: "other_international",
    country: "Brazil",
    matchKeys: ["sao paulo international film", "são paulo international film", "mostra sao paulo"],
  },
  {
    id: "mar-del-plata",
    name: "Mar del Plata International Film Festival",
    group: "other_international",
    country: "Argentina",
    matchKeys: ["mar del plata"],
  },
  {
    id: "shanghai",
    name: "Shanghai International Film Festival",
    group: "other_international",
    country: "China",
    matchKeys: ["shanghai international film festival"],
  },
]);

/**
 * @param {string | null | undefined} value
 */
export function normalizeFestivalMatchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Reject Cannes market / pitch / WIP style mentions when section or text is present.
 * @param {{ section?: unknown, original_text?: unknown, acceptance_reason?: unknown }} [row]
 */
export function isExcludedCannesMarketContext(row = {}) {
  const blob = normalizeFestivalMatchText(
    [row.section, row.original_text, row.acceptance_reason].filter(Boolean).join(" ")
  );
  if (!blob) return false;
  return (
    /\bmarche du film\b/.test(blob) ||
    /\bmarket\b/.test(blob) ||
    /\bshorts corner\b/.test(blob) ||
    /\bpitch\b/.test(blob) ||
    /\bwip\b/.test(blob) ||
    /\bwork in progress\b/.test(blob)
  );
}

/**
 * @param {string | null | undefined} festivalName
 * @param {{ section?: unknown, original_text?: unknown, acceptance_reason?: unknown }} [row]
 * @returns {ResonaleMajorFestival | null}
 */
export function matchResonaleMajorFestival(festivalName, row = {}) {
  const normalized = normalizeFestivalMatchText(festivalName);
  if (!normalized) return null;

  /** @type {ResonaleMajorFestival | null} */
  let best = null;
  let bestKeyLen = 0;

  for (const festival of RESONALE_MAJOR_FESTIVALS) {
    for (const key of festival.matchKeys) {
      const needle = normalizeFestivalMatchText(key);
      if (!needle) continue;
      // Prefer phrase containment; avoid ultra-short accidental hits except curated short keys.
      const hit =
        normalized === needle ||
        normalized.includes(needle) ||
        // Allow short official aliases only when the candidate name is essentially the alias.
        (needle.length <= 6 &&
          normalized.length <= needle.length + 2 &&
          (normalized === needle || needle.startsWith(normalized)));
      if (!hit) continue;
      if (needle.length >= bestKeyLen) {
        best = festival;
        bestKeyLen = needle.length;
      }
    }
  }

  if (!best) return null;

  if (best.id === "cannes" && isExcludedCannesMarketContext(row)) {
    return null;
  }

  // Guard: bare "venice" / "busan" / "tiff" already listed as keys; "anima" alone is not.
  if (best.id === "anima-brussels") {
    if (
      !normalized.includes("brussels") &&
      !normalized.includes("anima brussels")
    ) {
      // "Anima" alone could be many festivals — require Brussels unless exact Anima Brussels.
      if (normalized !== "anima brussels") return null;
    }
  }

  return best;
}

/**
 * @param {string | null | undefined} festivalName
 * @param {object} [row]
 */
export function isResonaleMajorFestival(festivalName, row = {}) {
  return matchResonaleMajorFestival(festivalName, row) != null;
}

/**
 * Prompt bullet list for AI festival participation.
 */
export function formatResonaleMajorFestivalsForPrompt() {
  return RESONALE_MAJOR_FESTIVALS.map((festival) => {
    const place = festival.country ? ` — ${festival.country}` : "";
    const note = festival.notes ? ` (${festival.notes})` : "";
    return `- ${festival.name}${place}${note}`;
  }).join("\n");
}

/**
 * Keep only major-festival participation rows.
 * @param {unknown} claims
 * @returns {object[]}
 */
export function filterClaimsToResonaleMajorFestivals(claims) {
  if (!Array.isArray(claims)) return [];
  /** @type {object[]} */
  const out = [];
  const seen = new Set();
  for (const row of claims) {
    if (!row || typeof row !== "object") continue;
    const matched = matchResonaleMajorFestival(row.festival_name, row);
    if (!matched) continue;
    const year = row.festival_year != null ? String(row.festival_year) : "";
    const dedupe = `${matched.id}::${year}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      ...row,
      festival_name: matched.name,
      canonical_festival_id: matched.id,
    });
  }
  return out;
}
