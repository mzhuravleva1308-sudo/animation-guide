import type { FestivalBadge, FestivalBadgeId } from "@/types/festival-badge";

export const FESTIVAL_BADGE_CONFIG: Record<
  FestivalBadgeId,
  {
    label: string;
    fullName: string;
    description: string;
    color: string;
    backgroundColor: string;
    patterns: RegExp[];
    /** Alternate canonical ids stored on claims (Resonale / official sources). */
    aliases?: string[];
  }
> = {
  annecy: {
    label: "Annecy",
    fullName: "Annecy International Animation Film Festival",
    description:
      "The world's largest dedicated animation festival, held each June in Annecy, France.",
    color: "#2457A6",
    backgroundColor: "#EAF0FB",
    patterns: [/annecy/i],
  },
  cannes: {
    label: "Cannes",
    fullName: "Cannes Film Festival",
    description:
      "Major international festival on the French Riviera, home of the Official Selection and Palme d'Or.",
    color: "#B8872F",
    backgroundColor: "#FBF4E6",
    patterns: [/cannes/i],
  },
  tiff: {
    label: "TIFF",
    fullName: "Toronto International Film Festival",
    description:
      "One of the largest public film festivals in the world, held each September in Toronto, Canada.",
    color: "#6B3FA0",
    backgroundColor: "#F2ECF8",
    patterns: [/toronto international film festival/i, /\btiff\b/i, /toronto.*film festival/i],
    aliases: ["toronto"],
  },
  berlinale: {
    label: "Berlinale",
    fullName: "Berlin International Film Festival",
    description:
      "Leading European festival held each February in Berlin, known for artistic programming and the Golden Bear.",
    color: "#B5283D",
    backgroundColor: "#F9E9EC",
    patterns: [/berlinale/i, /berlin international film festival/i],
  },
  sundance: {
    label: "Sundance",
    fullName: "Sundance Film Festival",
    description:
      "Premier U.S. festival for independent film, held each January in Park City, Utah.",
    color: "#D76A24",
    backgroundColor: "#FCEEE5",
    patterns: [/sundance/i],
  },
  venice: {
    label: "Venice",
    fullName: "Venice International Film Festival",
    description:
      "One of the world's oldest film festivals, held on the Lido and known for the Golden Lion.",
    color: "#2F6F6A",
    backgroundColor: "#E8F3F1",
    patterns: [/venice international film festival/i, /\bvenice\b/i, /biennale/i],
  },
  locarno: {
    label: "Locarno",
    fullName: "Locarno Film Festival",
    description:
      "Major Swiss festival on Lake Maggiore, known for the Golden Leopard.",
    color: "#3B5BDB",
    backgroundColor: "#EEF1FB",
    patterns: [/locarno/i],
  },
  busan: {
    label: "Busan",
    fullName: "Busan International Film Festival",
    description:
      "Leading Asian film festival held each autumn in Busan, South Korea.",
    color: "#0F766E",
    backgroundColor: "#E6F4F2",
    patterns: [/busan international film festival/i, /\bbusan\b/i, /\bbiff\b/i],
  },
  bfi_london: {
    label: "BFI",
    fullName: "BFI London Film Festival",
    description:
      "The UK's largest public film festival, presented by the British Film Institute.",
    color: "#1D4ED8",
    backgroundColor: "#EAF0FB",
    patterns: [/bfi london/i, /london film festival/i],
    aliases: ["bfi-london"],
  },
  san_sebastian: {
    label: "San Sebastián",
    fullName: "San Sebastián International Film Festival",
    description:
      "Major Spanish A-list festival known for the Golden Shell.",
    color: "#9A3412",
    backgroundColor: "#F8EDE6",
    patterns: [/san sebasti[aá]n/i, /donostia/i],
    aliases: ["san-sebastian"],
  },
  melbourne: {
    label: "MIFF",
    fullName: "Melbourne International Film Festival",
    description:
      "Australia's largest film festival, held each winter in Melbourne.",
    color: "#047857",
    backgroundColor: "#E8F5EF",
    patterns: [/melbourne international film festival/i, /\bmiff\b/i],
  },
  sydney: {
    label: "Sydney",
    fullName: "Sydney Film Festival",
    description:
      "Long-running Australian festival presenting international cinema in Sydney.",
    color: "#0369A1",
    backgroundColor: "#E8F3FA",
    patterns: [/sydney film festival/i],
  },
  mar_del_plata: {
    label: "Mar del Plata",
    fullName: "Mar del Plata International Film Festival",
    description:
      "Latin America's only FIAPF A-list competitive festival, held in Argentina.",
    color: "#A16207",
    backgroundColor: "#F7F1E4",
    patterns: [/mar del plata/i],
    aliases: ["mar-del-plata"],
  },
  tokyo_anime: {
    label: "TAAF",
    fullName: "Tokyo Anime Award Festival",
    description:
      "Japanese festival celebrating animation, closely linked with the Tokyo International Anime Fair.",
    color: "#C55B88",
    backgroundColor: "#F9EAF1",
    patterns: [/tokyo anime award/i, /\btaaf\b/i],
  },
};

const BADGE_ORDER: FestivalBadgeId[] = [
  "annecy",
  "cannes",
  "venice",
  "berlinale",
  "tiff",
  "sundance",
  "locarno",
  "busan",
  "bfi_london",
  "san_sebastian",
  "melbourne",
  "sydney",
  "mar_del_plata",
  "tokyo_anime",
];

const ALIAS_TO_BADGE_ID = new Map<string, FestivalBadgeId>();
for (const id of BADGE_ORDER) {
  ALIAS_TO_BADGE_ID.set(id, id);
  for (const alias of FESTIVAL_BADGE_CONFIG[id].aliases ?? []) {
    ALIAS_TO_BADGE_ID.set(alias, id);
  }
}

/**
 * Map canonical festival id or free-text festival name to a badge id.
 */
export function resolveFestivalBadgeId(
  value: string | null | undefined
): FestivalBadgeId | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const byAlias = ALIAS_TO_BADGE_ID.get(normalized);
  if (byAlias) {
    return byAlias;
  }

  const byAliasLower = ALIAS_TO_BADGE_ID.get(normalized.toLowerCase());
  if (byAliasLower) {
    return byAliasLower;
  }

  for (const id of BADGE_ORDER) {
    const config = FESTIVAL_BADGE_CONFIG[id];
    if (config.patterns.some((pattern) => pattern.test(normalized))) {
      return id;
    }
  }

  return null;
}

export function festivalBadgeFromId(id: FestivalBadgeId): FestivalBadge {
  const config = FESTIVAL_BADGE_CONFIG[id];
  return {
    id,
    label: config.label,
    fullName: config.fullName,
    description: config.description,
    color: config.color,
    backgroundColor: config.backgroundColor,
  };
}

/**
 * Build unique festival badges for a film from claim rows and catalog festival field.
 */
export function buildFilmFestivalBadges(input: {
  catalogFestival?: string | null;
  claims?: Array<{
    canonical_festival_id?: string | null;
    raw_festival_name?: string | null;
  }>;
}): FestivalBadge[] {
  /** @type {Map<FestivalBadgeId, FestivalBadge>} */
  const badges = new Map<FestivalBadgeId, FestivalBadge>();

  const add = (value: string | null | undefined) => {
    const id = resolveFestivalBadgeId(value);
    if (id && !badges.has(id)) {
      badges.set(id, festivalBadgeFromId(id));
    }
  };

  add(input.catalogFestival ?? null);

  for (const claim of input.claims ?? []) {
    add(claim.canonical_festival_id ?? null);
    add(claim.raw_festival_name ?? null);
  }

  return BADGE_ORDER.filter((id) => badges.has(id)).map((id) => badges.get(id)!);
}
