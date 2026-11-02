/**
 * Curate TMDB/JustWatch watch/providers into a compact VPN-friendly summary:
 * provider + offer type + region codes (no deep links).
 */

/** @typedef {"flatrate" | "rent" | "buy" | "free" | "ads"} FilmWatchOfferType */

/**
 * @typedef {object} FilmWatchOffer
 * @property {string} provider
 * @property {FilmWatchOfferType} type
 * @property {string[]} regions
 */

/**
 * @typedef {object} FilmWatchAppleLinks
 * @property {string} checked_at
 * @property {number | null} [track_id]
 * @property {Record<string, string>} by_region
 */

/**
 * @typedef {object} FilmWatchAvailability
 * @property {"tmdb"} source
 * @property {string} checked_at
 * @property {number | null} tmdb_id
 * @property {FilmWatchOffer[]} offers
 * @property {FilmWatchAppleLinks | null} [apple_links]
 */

/** @type {ReadonlyArray<{ match: RegExp, name: string, rank: number }>} */
export const WATCH_PROVIDER_RULES = [
  { match: /^mubi$/i, name: "MUBI", rank: 1 },
  { match: /^criterion channel$/i, name: "Criterion Channel", rank: 2 },
  { match: /^ovid$/i, name: "OVID", rank: 3 },
  { match: /^film movement/i, name: "Film Movement", rank: 4 },
  { match: /^arte$/i, name: "Arte", rank: 5 },
  { match: /^filmin$/i, name: "Filmin", rank: 6 },
  { match: /^bfi player$/i, name: "BFI Player", rank: 7 },
  { match: /^netflix$/i, name: "Netflix", rank: 10 },
  { match: /^disney(\+| plus)?$/i, name: "Disney+", rank: 11 },
  { match: /^(hbo )?max$/i, name: "Max", rank: 12 },
  { match: /^amazon prime video$/i, name: "Prime Video", rank: 13 },
  { match: /^apple tv\+$/i, name: "Apple TV+", rank: 14 },
  { match: /^apple tv( store)?$/i, name: "Apple TV", rank: 20 },
  { match: /^google play movies$/i, name: "Google Play", rank: 21 },
  { match: /^amazon video$/i, name: "Amazon Video", rank: 22 },
  { match: /^youtube$/i, name: "YouTube", rank: 23 },
  { match: /^fandango at home$/i, name: "Fandango at Home", rank: 24 },
  { match: /^kanopy$/i, name: "Kanopy", rank: 40 },
  { match: /^hoopla$/i, name: "Hoopla", rank: 41 },
  { match: /^tubi( tv)?$/i, name: "Tubi", rank: 42 },
];

const OFFER_TYPES = /** @type {const} */ ([
  "flatrate",
  "ads",
  "free",
  "rent",
  "buy",
]);

const TYPE_RANK = {
  flatrate: 0,
  ads: 1,
  free: 2,
  rent: 3,
  buy: 4,
};

/**
 * @param {string | null | undefined} providerName
 * @returns {{ name: string, rank: number } | null}
 */
export function matchWatchProvider(providerName) {
  const raw = String(providerName ?? "").trim();
  if (!raw) return null;
  // Skip marketplace/channel add-ons (noise for VPN planning).
  if (/\bchannel\b/i.test(raw) && !/^criterion channel$/i.test(raw)) {
    return null;
  }
  for (const rule of WATCH_PROVIDER_RULES) {
    if (rule.match.test(raw)) {
      return { name: rule.name, rank: rule.rank };
    }
  }
  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} tmdbResults
 *   TMDB `watch/providers` `.results` map (region → buckets).
 * @param {{ tmdbId?: number | null, checkedAt?: string | null }} [options]
 * @returns {FilmWatchAvailability}
 */
export function buildWatchAvailabilityFromTmdbResults(tmdbResults, options = {}) {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const tmdbId =
    options.tmdbId == null || !Number.isFinite(Number(options.tmdbId))
      ? null
      : Number(options.tmdbId);

  /** @type {Map<string, { provider: string, type: FilmWatchOfferType, regions: Set<string>, rank: number }>} */
  const byKey = new Map();

  for (const [regionRaw, entry] of Object.entries(tmdbResults ?? {})) {
    const region = String(regionRaw ?? "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{2}$/.test(region) || !entry || typeof entry !== "object") {
      continue;
    }

    for (const type of OFFER_TYPES) {
      const list = /** @type {unknown} */ (
        /** @type {Record<string, unknown>} */ (entry)[type]
      );
      if (!Array.isArray(list)) continue;

      for (const item of list) {
        const providerName =
          item && typeof item === "object"
            ? /** @type {{ provider_name?: string }} */ (item).provider_name
            : null;
        const matched = matchWatchProvider(providerName);
        if (!matched) continue;

        // Library/FAST brands are noise as rent/buy rows.
        if ((type === "rent" || type === "buy") && matched.rank >= 40) {
          continue;
        }

        const key = `${matched.name}::${type}`;
        let row = byKey.get(key);
        if (!row) {
          row = {
            provider: matched.name,
            type,
            regions: new Set(),
            rank: matched.rank,
          };
          byKey.set(key, row);
        }
        row.regions.add(region);
      }
    }
  }

  const offers = [...byKey.values()]
    .map((row) => ({
      provider: row.provider,
      type: row.type,
      regions: [...row.regions].sort(),
      rank: row.rank,
    }))
    .sort((a, b) => {
      const typeDelta =
        (TYPE_RANK[a.type] ?? 99) - (TYPE_RANK[b.type] ?? 99);
      if (typeDelta !== 0) return typeDelta;
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (b.regions.length !== a.regions.length) {
        return b.regions.length - a.regions.length;
      }
      return a.provider.localeCompare(b.provider);
    })
    .map(({ provider, type, regions }) => ({ provider, type, regions }));

  return {
    source: "tmdb",
    checked_at: checkedAt,
    tmdb_id: tmdbId,
    offers,
    apple_links: null,
  };
}

/**
 * @param {unknown} value
 * @returns {FilmWatchAvailability | null}
 */
export function normalizeWatchAvailability(value) {
  if (!value || typeof value !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (value);
  if (row.source !== "tmdb" || !Array.isArray(row.offers)) return null;
  const offers = row.offers
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const offer = /** @type {Record<string, unknown>} */ (item);
      const provider = String(offer.provider ?? "").trim();
      const type = String(offer.type ?? "").trim();
      if (!provider || !OFFER_TYPES.includes(/** @type {any} */ (type))) {
        return null;
      }
      const regions = Array.isArray(offer.regions)
        ? offer.regions
            .map((r) => String(r ?? "").trim().toUpperCase())
            .filter((r) => /^[A-Z]{2}$/.test(r))
        : [];
      if (!regions.length) return null;
      return {
        provider,
        type: /** @type {FilmWatchOfferType} */ (type),
        regions: [...new Set(regions)].sort(),
      };
    })
    .filter(Boolean);

  return {
    source: "tmdb",
    checked_at:
      typeof row.checked_at === "string" && row.checked_at
        ? row.checked_at
        : new Date(0).toISOString(),
    tmdb_id:
      row.tmdb_id == null || !Number.isFinite(Number(row.tmdb_id))
        ? null
        : Number(row.tmdb_id),
    offers: /** @type {FilmWatchOffer[]} */ (offers),
    apple_links: normalizeAppleLinks(row.apple_links),
  };
}

/**
 * @param {unknown} value
 * @returns {FilmWatchAppleLinks | null}
 */
export function normalizeAppleLinks(value) {
  if (!value || typeof value !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (value);
  const raw = row.by_region;
  if (!raw || typeof raw !== "object") return null;
  /** @type {Record<string, string>} */
  const byRegion = {};
  for (const [codeRaw, urlRaw] of Object.entries(raw)) {
    const code = String(codeRaw ?? "")
      .trim()
      .toUpperCase();
    const url = String(urlRaw ?? "").trim();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    if (!/^https:\/\//i.test(url)) continue;
    byRegion[code] = url;
  }
  if (!Object.keys(byRegion).length) return null;
  const trackIdRaw = row.track_id;
  const trackId =
    trackIdRaw == null || !Number.isFinite(Number(trackIdRaw))
      ? null
      : Number(trackIdRaw);
  return {
    checked_at:
      typeof row.checked_at === "string" && row.checked_at
        ? row.checked_at
        : new Date(0).toISOString(),
    track_id: trackId,
    by_region: byRegion,
  };
}

/** One week — used for on-demand TMDB refresh when opening Watch. */
export const WATCH_AVAILABILITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {string | null | undefined} checkedAt
 * @param {{ now?: number, maxAgeMs?: number }} [options]
 */
export function isWatchAvailabilityStale(checkedAt, options = {}) {
  const maxAgeMs = options.maxAgeMs ?? WATCH_AVAILABILITY_MAX_AGE_MS;
  const now = options.now ?? Date.now();
  if (!checkedAt || typeof checkedAt !== "string") return true;
  const then = Date.parse(checkedAt);
  if (!Number.isFinite(then)) return true;
  return now - then > maxAgeMs;
}

/**
 * @param {FilmWatchOfferType} type
 */
export function watchOfferTypeLabel(type) {
  switch (type) {
    case "flatrate":
      return "stream";
    case "ads":
      return "free+ads";
    case "free":
      return "free";
    case "rent":
      return "rent";
    case "buy":
      return "buy";
    default:
      return type;
  }
}

/**
 * Compact regions for UI: US, FR, DE +3
 * @param {string[]} regions
 * @param {number} [limit]
 */
export function formatWatchRegions(regions, limit = 8) {
  const list = Array.isArray(regions) ? regions : [];
  if (list.length <= limit) return list.join(", ");
  const head = list.slice(0, limit).join(", ");
  return `${head} +${list.length - limit}`;
}

/** @type {Intl.DisplayNames | null} */
let regionDisplayNames = null;

/**
 * Full English country name for an ISO region code (FR → France).
 * @param {string} regionCode
 */
export function watchRegionDisplayName(regionCode) {
  const code = String(regionCode ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return code || "Unknown";
  try {
    if (!regionDisplayNames) {
      regionDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
    }
    return regionDisplayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Invert provider→regions into country→services, A–Z by country name.
 * @param {FilmWatchOffer[]} offers
 * @param {{ appleLinksByRegion?: Record<string, string> | null }} [options]
 * @returns {Array<{ code: string, name: string, services: Array<{ provider: string, type: FilmWatchOfferType, url: string | null }> }>}
 */
export function groupWatchOffersByCountry(offers, options = {}) {
  const appleLinksByRegion = options.appleLinksByRegion ?? {};
  /** @type {Map<string, Map<string, { provider: string, type: FilmWatchOfferType, url: string | null }>>} */
  const byCountry = new Map();

  for (const offer of offers ?? []) {
    if (!offer?.provider || !Array.isArray(offer.regions)) continue;
    for (const region of offer.regions) {
      const code = String(region ?? "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z]{2}$/.test(code)) continue;
      let services = byCountry.get(code);
      if (!services) {
        services = new Map();
        byCountry.set(code, services);
      }
      const key = `${offer.provider}::${offer.type}`;
      if (!services.has(key)) {
        const appleUrl =
          offer.provider === "Apple TV" || offer.provider === "Apple TV+"
            ? appleLinksByRegion[code] ?? null
            : null;
        services.set(key, {
          provider: offer.provider,
          type: /** @type {FilmWatchOfferType} */ (offer.type),
          url: appleUrl,
        });
      }
    }
  }

  return [...byCountry.entries()]
    .map(([code, services]) => ({
      code,
      name: watchRegionDisplayName(code),
      services: [...services.values()].sort((a, b) => {
        const typeDelta =
          (TYPE_RANK[a.type] ?? 99) - (TYPE_RANK[b.type] ?? 99);
        if (typeDelta !== 0) return typeDelta;
        return a.provider.localeCompare(b.provider);
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
}

/**
 * Regions where Apple TV / Apple TV+ appears in offers.
 * @param {FilmWatchOffer[]} offers
 * @returns {string[]}
 */
export function appleRegionsFromOffers(offers) {
  const regions = new Set();
  for (const offer of offers ?? []) {
    if (offer?.provider !== "Apple TV" && offer?.provider !== "Apple TV+") {
      continue;
    }
    for (const region of offer.regions ?? []) {
      const code = String(region ?? "")
        .trim()
        .toUpperCase();
      if (/^[A-Z]{2}$/.test(code)) regions.add(code);
    }
  }
  return [...regions].sort();
}
