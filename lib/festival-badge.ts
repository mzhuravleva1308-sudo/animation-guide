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
  "tiff",
  "berlinale",
  "sundance",
  "tokyo_anime",
];

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

  if (normalized in FESTIVAL_BADGE_CONFIG) {
    return normalized as FestivalBadgeId;
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
