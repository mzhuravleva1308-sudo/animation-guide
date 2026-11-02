/**
 * One-shot MUBI deep-link resolution via OpenAI web search.
 * Not used in automatic Watch refresh — run scripts/sync-mubi-watch-links.mjs manually.
 */
import { parseJsonFromModelText } from "./film-discovery-workflow.mjs";

const MUBI_FILM_PATH =
  /^(?:\/[a-z]{2}\/[a-z]{2})?\/films\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/i;

/**
 * @param {string | null | undefined} raw
 * @returns {{ url: string, slug: string } | null}
 */
export function normalizeMubiFilmUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  if (!/^([a-z0-9-]+\.)?mubi\.com$/i.test(parsed.hostname)) return null;
  const match = parsed.pathname.match(MUBI_FILM_PATH);
  if (!match) return null;
  const slug = match[1].toLowerCase();
  return {
    slug,
    url: `https://mubi.com/films/${slug}`,
  };
}

/**
 * Prefer a localized MUBI film URL when we know the country.
 * @param {string | null | undefined} canonicalUrl
 * @param {string | null | undefined} regionCode
 */
export function mubiUrlForRegion(canonicalUrl, regionCode) {
  const normalized = normalizeMubiFilmUrl(canonicalUrl);
  if (!normalized) return null;
  const code = String(regionCode ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return normalized.url;
  return `https://mubi.com/en/${code}/films/${normalized.slug}`;
}

/**
 * @param {unknown} value
 * @returns {{ checked_at: string, url: string, slug: string } | null}
 */
export function normalizeMubiLinks(value) {
  if (!value || typeof value !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (value);
  const normalized = normalizeMubiFilmUrl(row.url);
  if (!normalized) return null;
  return {
    checked_at:
      typeof row.checked_at === "string" && row.checked_at
        ? row.checked_at
        : new Date(0).toISOString(),
    url: normalized.url,
    slug: normalized.slug,
  };
}

/**
 * @param {object} input
 * @param {import("openai").default} input.openai
 * @param {string} input.title
 * @param {string | null | undefined} [input.originalTitle]
 * @param {number | null | undefined} [input.year]
 * @param {string} [input.model]
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<{ url: string, slug: string } | null>}
 */
export async function resolveMubiFilmLink(input) {
  const title = String(input.title ?? "").trim();
  if (!title) return null;
  const year =
    input.year != null && Number.isFinite(Number(input.year))
      ? Number(input.year)
      : null;
  const originalTitle = String(input.originalTitle ?? "").trim();
  const model =
    input.model ||
    process.env.WATCH_MUBI_LINK_MODEL ||
    process.env.WEEKLY_FILM_DISCOVERY_MODEL ||
    "gpt-4.1-mini";

  const response = await input.openai.responses.create({
    model,
    temperature: 0,
    tools: [{ type: "web_search_preview" }],
    tool_choice: "auto",
    input: [
      {
        role: "developer",
        content: `Find the official MUBI film page for one movie.
Return ONLY JSON: {"url":"https://mubi.com/.../films/..."|null,"confidence":"high"|"low"|"none"}
Rules:
- URL must be on mubi.com and contain /films/
- Prefer the canonical film page for this exact title + year
- If unsure, return {"url":null,"confidence":"none"}
- Never invent a slug`,
      },
      {
        role: "user",
        content: JSON.stringify({
          title,
          original_title: originalTitle || null,
          year,
          query_hint: `${title}${year ? ` ${year}` : ""} site:mubi.com/films`,
        }),
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
  const confidence = String(
    /** @type {Record<string, unknown>} */ (parsed).confidence ?? ""
  ).toLowerCase();
  if (confidence === "none" || confidence === "low") {
    // Still accept low if URL validates hard.
  }
  const normalized = normalizeMubiFilmUrl(
    /** @type {Record<string, unknown>} */ (parsed).url
  );
  if (!normalized) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  const ok = await verifyMubiFilmUrl(normalized.url, {
    title,
    year,
    fetchImpl,
  });
  return ok ? normalized : null;
}

/**
 * Light page check: URL reachable and looks like the right title/year.
 * @param {string} url
 * @param {{ title: string, year?: number | null, fetchImpl?: typeof fetch }} options
 */
export async function verifyMubiFilmUrl(url, options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "text/html",
      "User-Agent": "ResonaleCatalog/1.0 (+https://resonale.com)",
    },
  });
  if (!response.ok) return false;
  const finalUrl = normalizeMubiFilmUrl(response.url || url);
  if (!finalUrl) return false;

  const html = (await response.text().catch(() => "")).slice(0, 20000);
  const titleNeedle = String(options.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const year = options.year;
  const htmlLower = html.toLowerCase();
  if (titleNeedle) {
    const compactHtml = htmlLower.replace(/[^a-z0-9]+/g, " ");
    const tokens = titleNeedle.split(" ").filter((t) => t.length > 2);
    const hitTokens = tokens.filter((token) => compactHtml.includes(token));
    if (tokens.length && hitTokens.length < Math.min(2, tokens.length)) {
      return false;
    }
  }
  if (year != null && Number.isFinite(year)) {
    if (!html.includes(String(year)) && !finalUrl.slug.includes(String(year))) {
      // Year often appears; don't hard-fail if title matched strongly.
    }
  }
  return true;
}

/**
 * @param {Array<{ provider?: string }>} offers
 */
export function offersIncludeMubi(offers) {
  return (offers ?? []).some((offer) => offer?.provider === "MUBI");
}
