/**
 * One-shot Prime Video deep-link resolution via OpenAI web search.
 * Not used in automatic Watch refresh — run scripts/sync-prime-video-watch-links.mjs.
 */
import { parseJsonFromModelText } from "./film-discovery-workflow.mjs";

const DETAIL_PATH = /^\/(?:-\/[a-z]{2}\/)?detail\/([A-Z0-9]+)\/?$/i;

/**
 * @param {string | null | undefined} raw
 * @returns {{ url: string, id: string } | null}
 */
export function normalizePrimeVideoUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "primevideo.com" && !host.endsWith(".primevideo.com")) {
    return null;
  }
  const match = parsed.pathname.match(DETAIL_PATH);
  if (!match) return null;
  const id = match[1];
  return {
    id,
    url: `https://www.primevideo.com/detail/${id}`,
  };
}

/**
 * @param {unknown} value
 * @returns {{ checked_at: string, url: string | null, id: string | null } | null}
 */
export function normalizePrimeLinks(value) {
  if (!value || typeof value !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (value);
  const checked_at =
    typeof row.checked_at === "string" && row.checked_at
      ? row.checked_at
      : null;
  // checked_at marks one-shot attempt (hit or miss) so sync won't retry.
  if (!checked_at) return null;
  const normalized = normalizePrimeVideoUrl(row.url);
  return {
    checked_at,
    url: normalized?.url ?? null,
    id: normalized?.id ?? null,
  };
}

/**
 * @param {Array<{ provider?: string }>} offers
 */
export function offersIncludePrimeVideo(offers) {
  return (offers ?? []).some((offer) => offer?.provider === "Prime Video");
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
export async function resolvePrimeVideoLink(input) {
  const title = String(input.title ?? "").trim();
  if (!title) return null;
  const year =
    input.year != null && Number.isFinite(Number(input.year))
      ? Number(input.year)
      : null;
  const originalTitle = String(input.originalTitle ?? "").trim();
  const model =
    input.model ||
    process.env.WATCH_PRIME_LINK_MODEL ||
    process.env.WEEKLY_FILM_DISCOVERY_MODEL ||
    "gpt-4.1-mini";

  const yearPart = year != null ? String(year) : "";
  const q1 = `"${title}" ${yearPart} site:www.primevideo.com/detail`
    .replace(/\s+/g, " ")
    .trim();
  const q2 = originalTitle
    ? `"${originalTitle}" ${yearPart} site:www.primevideo.com/detail`
        .replace(/\s+/g, " ")
        .trim()
    : `"${title}" Prime Video site:www.primevideo.com/detail`;

  const response = await input.openai.responses.create({
    model,
    temperature: 0,
    tools: [{ type: "web_search_preview" }],
    tool_choice: "required",
    input: [
      {
        role: "developer",
        content: `Find the official Prime Video TITLE page for one movie (subscription / included with Prime).
Return ONLY JSON: {"url":"https://..."|null,"confidence":"high"|"low"|"none"}

Search using EXACTLY these web queries (copy into the search tool):
1) ${q1}
2) ${q2}

Hard rules:
- Only return a URL that search results actually contain
- Allowed host/path only: www.primevideo.com/detail/<id>
- Never invent detail IDs
- No amazon.com rent/buy pages, no /gp/video/offers, no search pages
- If nothing on primevideo.com/detail, return {"url":null,"confidence":"none"}`,
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
  const normalized = normalizePrimeVideoUrl(
    /** @type {Record<string, unknown>} */ (parsed).url
  );
  if (!normalized) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  const ok = await verifyPrimeVideoUrl(normalized.url, {
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
export async function verifyPrimeVideoUrl(url, options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) return false;
  const finalNormalized = normalizePrimeVideoUrl(response.url || url);
  if (!finalNormalized) return false;

  const html = (await response.text().catch(() => "")).slice(0, 30000);
  if (/that shouldn't have happened|page not found|couldn't find/i.test(html)) {
    return false;
  }
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
