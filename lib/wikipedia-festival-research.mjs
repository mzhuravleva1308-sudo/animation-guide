const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT = "AnimationPreCatalogBackfill/1.0 (one-time festival backfill)";
const REQUEST_DELAY_MS = 3500;
const MAX_RETRIES = 6;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Response} response
 * @param {number} attempt
 */
function getRetryDelayMs(response, attempt) {
  const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }

  const baseDelay = REQUEST_DELAY_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 750);
  return baseDelay + jitter;
}

/**
 * @param {Record<string, string>} params
 * @param {number} [attempt]
 */
async function wikipediaApi(params, attempt = 0) {
  const url = new URL(WIKIPEDIA_API);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (
    (response.status === 429 || response.status === 503) &&
    attempt < MAX_RETRIES
  ) {
    await sleep(getRetryDelayMs(response, attempt));
    return wikipediaApi(params, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`Wikipedia API error: ${response.status}`);
  }

  return response.json();
}

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null, director?: string | null }} film
 */
export function buildWikipediaSearchQueries(film) {
  const queries = [];
  const yearSuffix = film.year ? ` ${film.year}` : "";
  const animationHint = " animated film";

  if (film.title) {
    queries.push(`${film.title}${yearSuffix}${animationHint}`);
    queries.push(`${film.title}${yearSuffix} film`);
  }

  if (film.original_title && film.original_title !== film.title) {
    queries.push(`${film.original_title}${yearSuffix}${animationHint}`);
  }

  if (film.director && film.title) {
    queries.push(`${film.title} ${film.director}${animationHint}`);
  }

  return [...new Set(queries.map((query) => query.trim()).filter(Boolean))];
}

/**
 * @param {{ title: string, original_title?: string | null, year?: number | null, director?: string | null }} film
 */
export async function findWikipediaArticle(film) {
  const queries = buildWikipediaSearchQueries(film);

  for (const query of queries) {
    const data = await wikipediaApi({
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: "5",
      srnamespace: "0",
    });
    await sleep(REQUEST_DELAY_MS);

    const results = data.query?.search ?? [];
    if (results.length === 0) {
      continue;
    }

    for (const result of results) {
      const page = await fetchWikipediaPage(result.title, film);
      if (page) {
        return page;
      }
    }
  }

  return null;
}

/**
 * @param {string} title
 * @param {{ title: string, year?: number | null }} film
 */
async function fetchWikipediaPage(title, film) {
  const data = await wikipediaApi({
    action: "query",
    prop: "extracts|info",
    explaintext: "1",
    exsectionformat: "plain",
    inprop: "url",
    titles: title,
  });
  await sleep(REQUEST_DELAY_MS);

  const pages = Object.values(data.query?.pages ?? {});
  const page = pages[0];
  if (!page || page.missing || !page.extract) {
    return null;
  }

  const extract = String(page.extract);
  const filmTitle = film.title?.toLowerCase() ?? "";
  const extractLower = extract.toLowerCase();

  if (filmTitle && !extractLower.includes(filmTitle.split(" ")[0])) {
    const yearPattern = film.year ? String(film.year) : null;
    if (!yearPattern || !extract.includes(yearPattern)) {
      return null;
    }
  }

  return {
    title: page.title,
    url: page.fullurl,
    extract,
  };
}

/**
 * @param {string} wikipediaTitle
 */
export async function fetchWikipediaExternalLinks(wikipediaTitle) {
  const data = await wikipediaApi({
    action: "query",
    prop: "extlinks",
    titles: wikipediaTitle,
    ellimit: "500",
  });
  await sleep(REQUEST_DELAY_MS);

  const pages = Object.values(data.query?.pages ?? {});
  const page = pages[0];
  if (!page || page.missing) {
    return [];
  }

  return [
    ...new Set(
      (page.extlinks ?? [])
        .map((link) => link["*"])
        .filter((url) => typeof url === "string" && /^https?:\/\//i.test(url))
    ),
  ];
}
