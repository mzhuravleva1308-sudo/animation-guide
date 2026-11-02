/**
 * One-shot Amazon Video deep-link resolution via OpenAI web search.
 * Not used in automatic Watch refresh — run scripts/sync-amazon-watch-links.mjs manually.
 */
import { parseJsonFromModelText } from "./film-discovery-workflow.mjs";

const ASIN_RE = /\b(B0[A-Z0-9]{8})\b/i;

/** ISO region → Amazon store host for gpd/video / dp links. */
export const AMAZON_HOST_BY_REGION = {
  US: "www.amazon.com",
  GB: "www.amazon.co.uk",
  UK: "www.amazon.co.uk",
  DE: "www.amazon.de",
  FR: "www.amazon.fr",
  IT: "www.amazon.it",
  ES: "www.amazon.es",
  CA: "www.amazon.ca",
  JP: "www.amazon.co.jp",
  AU: "www.amazon.com.au",
  IN: "www.amazon.in",
  MX: "www.amazon.com.mx",
  BR: "www.amazon.com.br",
  NL: "www.amazon.nl",
  PL: "www.amazon.pl",
  SE: "www.amazon.se",
  BE: "www.amazon.com.be",
  IE: "www.amazon.co.uk",
  AT: "www.amazon.de",
  CH: "www.amazon.de",
};

/**
 * @param {string | null | undefined} raw
 * @returns {{ url: string, asin: string | null, kind: "amazon" | "primevideo" } | null}
 */
export function normalizeAmazonVideoUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "primevideo.com" || host.endsWith(".primevideo.com")) {
    const detail = parsed.pathname.match(/\/detail\/([^/?#]+)/i);
    if (!detail) return null;
    const id = detail[1];
    return {
      kind: "primevideo",
      asin: ASIN_RE.test(id) ? id.toUpperCase() : null,
      url: `https://www.primevideo.com/detail/${id}`,
    };
  }

  if (!/(^|\.)amazon\./i.test(host)) return null;

  const asinMatch =
    parsed.pathname.match(/\/(?:gp\/video\/detail|dp|gp\/product)\/(B0[A-Z0-9]{8})/i) ||
    parsed.pathname.match(/\/(B0[A-Z0-9]{8})(?:\/|$)/i) ||
    text.match(ASIN_RE);
  if (!asinMatch) return null;
  const asin = asinMatch[1].toUpperCase();
  return {
    kind: "amazon",
    asin,
    url: `https://www.amazon.com/gp/video/detail/${asin}`,
  };
}

/**
 * @param {string | null | undefined} canonicalUrl
 * @param {string | null | undefined} regionCode
 */
export function amazonUrlForRegion(canonicalUrl, regionCode) {
  const normalized = normalizeAmazonVideoUrl(canonicalUrl);
  if (!normalized) return null;
  if (normalized.kind === "primevideo" || !normalized.asin) {
    return normalized.url;
  }
  const code = String(regionCode ?? "")
    .trim()
    .toUpperCase();
  const host = AMAZON_HOST_BY_REGION[code] ?? "www.amazon.com";
  return `https://${host}/gp/video/detail/${normalized.asin}`;
}

/**
 * @param {unknown} value
 * @returns {{ checked_at: string, url: string, asin: string | null, kind: "amazon" | "primevideo" } | null}
 */
export function normalizeAmazonLinks(value) {
  if (!value || typeof value !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (value);
  const normalized = normalizeAmazonVideoUrl(row.url);
  if (!normalized) return null;
  return {
    checked_at:
      typeof row.checked_at === "string" && row.checked_at
        ? row.checked_at
        : new Date(0).toISOString(),
    url: normalized.url,
    asin: normalized.asin,
    kind: normalized.kind,
  };
}

/**
 * @param {Array<{ provider?: string }>} offers
 */
export function offersIncludeAmazonVideo(offers) {
  return (offers ?? []).some((offer) => offer?.provider === "Amazon Video");
}

/**
 * @param {object} input
 * @param {import("openai").default} input.openai
 * @param {string} input.title
 * @param {string | null | undefined} [input.originalTitle]
 * @param {number | null | undefined} [input.year]
 * @param {string} [input.model]
 * @param {typeof fetch} [input.fetchImpl]
 */
export async function resolveAmazonVideoLink(input) {
  const title = String(input.title ?? "").trim();
  if (!title) return null;
  const year =
    input.year != null && Number.isFinite(Number(input.year))
      ? Number(input.year)
      : null;
  const originalTitle = String(input.originalTitle ?? "").trim();
  const model =
    input.model ||
    process.env.WATCH_AMAZON_LINK_MODEL ||
    process.env.WEEKLY_FILM_DISCOVERY_MODEL ||
    "gpt-4.1-mini";

  const yearPart = year != null ? String(year) : "";
  const q1 = `"${title}" ${yearPart} site:amazon.com/gp/video/detail`.replace(
    /\s+/g,
    " "
  ).trim();
  const q2 = `"${title}" ${yearPart} site:www.primevideo.com/detail`.replace(
    /\s+/g,
    " "
  ).trim();
  const q3 = originalTitle
    ? `"${originalTitle}" ${yearPart} site:amazon.com/gp/video/detail`
        .replace(/\s+/g, " ")
        .trim()
    : null;

  const response = await input.openai.responses.create({
    model,
    temperature: 0,
    tools: [{ type: "web_search_preview" }],
    tool_choice: "required",
    input: [
      {
        role: "developer",
        content: `Find one Amazon Video / Prime Video TITLE page for a movie.
Return ONLY JSON: {"url":"https://..."|null,"confidence":"high"|"low"|"none"}

Search using EXACTLY these web queries (copy them into the search tool, do not search the JSON):
1) ${q1}
2) ${q2}
${q3 ? `3) ${q3}` : ""}

Hard rules:
- Only return a URL that the search results actually contain
- Allowed: amazon.*/gp/video/detail/ASIN or primevideo.com/detail/...
- Never invent ASINs
- No /dp/ DVD pages, no /gp/video/offers, no search pages
- If nothing on those domains, return {"url":null,"confidence":"none"}`,
      },
      {
        role: "user",
        content: `Movie: ${title}${originalTitle ? ` (${originalTitle})` : ""}${yearPart ? `, ${yearPart}` : ""}`,
      },
    ],
  });

  const content =
    typeof response.output_text === "string" ? response.output_text : "";
  if (!content.trim()) return null;

  let parsed;
  try {
    parsed = parseJsonFromModelText(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const normalized = normalizeAmazonVideoUrl(
    /** @type {Record<string, unknown>} */ (parsed).url
  );
  if (!normalized) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  const ok = await verifyAmazonVideoUrl(normalized.url, {
    title,
    year,
    fetchImpl,
  });
  return ok ? normalized : null;
}

/**
 * @param {string} url
 * @param {{ title: string, year?: number | null, fetchImpl?: typeof fetch }} options
 */
export async function verifyAmazonVideoUrl(url, options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (compatible; ResonaleCatalog/1.0; +https://resonale.com)",
    },
  });
  if (!response.ok) return false;
  const finalNormalized = normalizeAmazonVideoUrl(response.url || url);
  if (!finalNormalized) return false;

  const html = (await response.text().catch(() => "")).slice(0, 25000);
  const titleNeedle = String(options.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!titleNeedle) return true;
  const compactHtml = html.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const tokens = titleNeedle.split(" ").filter((t) => t.length > 2);
  const hitTokens = tokens.filter((token) => compactHtml.includes(token));
  if (tokens.length && hitTokens.length < Math.min(2, tokens.length)) {
    return false;
  }
  return true;
}
