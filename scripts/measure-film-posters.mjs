/**
 * Probe poster HTTP headers/size/timing and (optionally) browser request count
 * for FilmCard's dual <img> with the same src.
 *
 * Usage:
 *   node scripts/measure-film-posters.mjs
 *   node scripts/measure-film-posters.mjs --with-browser
 */
import { createClient } from "@supabase/supabase-js";
import { applyAppEnv } from "./load-app-env.mjs";
import { applyPublicCatalogVisibilityFilter } from "../lib/public-catalog-films.mjs";
import { getFilmPosterUrl } from "../lib/film-poster.mjs";

applyAppEnv();

const withBrowser = process.argv.includes("--with-browser");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  console.error("Missing Supabase env.");
  process.exit(1);
}

const anon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function headOrGet(url) {
  const startedAt = Date.now();
  let response = await fetch(url, { method: "HEAD", redirect: "follow" });
  // Some storage setups reject HEAD — fall back to GET range / GET.
  if (!response.ok || response.status === 405) {
    response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Range: "bytes=0-0" },
    });
  }
  if (!response.ok && response.status !== 206) {
    response = await fetch(url, { method: "GET", redirect: "follow" });
  }
  const buffer =
    response.body && response.status !== 206
      ? Buffer.from(await response.arrayBuffer())
      : null;
  const ms = Date.now() - startedAt;
  return {
    url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength:
      Number(response.headers.get("content-length")) ||
      buffer?.byteLength ||
      null,
    cacheControl: response.headers.get("cache-control"),
    etag: response.headers.get("etag"),
    downloadMs: ms,
    bytesDownloaded: buffer?.byteLength ?? null,
  };
}

async function measureBrowserDoubleImg(posterUrl) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requests = [];

  page.on("request", (request) => {
    if (request.url() === posterUrl || request.url().startsWith(posterUrl)) {
      requests.push({
        url: request.url(),
        resourceType: request.resourceType(),
        method: request.method(),
      });
    }
  });

  const responses = [];
  page.on("response", async (response) => {
    if (response.url() === posterUrl || response.url().startsWith(posterUrl)) {
      const headers = response.headers();
      responses.push({
        url: response.url(),
        status: response.status(),
        fromCache: response.fromServiceWorker(),
        // Playwright doesn't expose HTTP cache hit directly; request count is
        // the primary signal for duplicate network fetches.
        cacheControl: headers["cache-control"] ?? null,
        contentLength: headers["content-length"]
          ? Number(headers["content-length"])
          : null,
      });
    }
  });

  await page.setContent(`<!doctype html>
<html><body>
  <img id="main" src="${posterUrl}" alt="main" loading="eager" decoding="async" width="190" height="280" />
  <img id="blur" src="${posterUrl}" alt="" aria-hidden="true" loading="eager" decoding="async" width="32" height="280" style="filter:blur(8px);opacity:0.2" />
</body></html>`);

  await page.waitForFunction(() => {
    const main = document.getElementById("main");
    const blur = document.getElementById("blur");
    return (
      main instanceof HTMLImageElement &&
      blur instanceof HTMLImageElement &&
      main.complete &&
      blur.complete &&
      main.naturalWidth > 0 &&
      blur.naturalWidth > 0
    );
  });

  const decodeTiming = await page.evaluate(async (url) => {
    const imgs = [...document.images].filter((img) => img.currentSrc === url || img.src === url);
    const entries = performance.getEntriesByName(url).map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
      duration: entry.duration,
    }));
    return {
      imageCount: imgs.length,
      resourceTimingEntries: entries,
    };
  }, posterUrl);

  await browser.close();

  return {
    networkRequestCount: requests.length,
    networkRequests: requests,
    networkResponses: responses,
    decodeTiming,
    doubleHttpFetchConfirmed: requests.length >= 2,
  };
}

async function main() {
  const { data, error } = await applyPublicCatalogVisibilityFilter(
    anon
      .from("films")
      .select(
        "id, title, poster_url, image_url, cold_start_score"
      )
      .order("cold_start_score", { ascending: false, nullsFirst: false })
      .limit(12)
  );

  if (error) {
    throw error;
  }

  const films = (data ?? [])
    .map((film) => ({
      id: film.id,
      title: film.title,
      posterUrl: getFilmPosterUrl(film),
    }))
    .filter((film) => film.posterUrl);

  const firstScreenApprox = films.slice(0, 3);
  const httpProbes = [];
  for (const film of films) {
    httpProbes.push({
      filmId: film.id,
      // title omitted from aggregate sort key; keep for human report only
      title: film.title,
      ...(await headOrGet(film.posterUrl)),
    });
  }

  httpProbes.sort(
    (a, b) => (b.contentLength ?? 0) - (a.contentLength ?? 0)
  );

  let browserProbe = null;
  if (withBrowser && films[0]?.posterUrl) {
    browserProbe = await measureBrowserDoubleImg(films[0].posterUrl);
  }

  console.log(
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        firstScreenEagerPosterSlots: 1,
        firstScreenSampleFilmIds: firstScreenApprox.map((f) => f.id),
        note:
          "FilmCard uses a single poster img (blur duplicate removed); eager only index 0, lazy thereafter. Dual-img probe below is diagnostic only.",
        heaviestPosters: httpProbes.slice(0, 5).map((row) => ({
          filmId: row.filmId,
          contentType: row.contentType,
          contentLength: row.contentLength,
          cacheControl: row.cacheControl,
          downloadMs: row.downloadMs,
          status: row.status,
        })),
        allProbed: httpProbes.map((row) => ({
          filmId: row.filmId,
          contentType: row.contentType,
          contentLength: row.contentLength,
          cacheControl: row.cacheControl,
          downloadMs: row.downloadMs,
          status: row.status,
        })),
        browserDualImgProbe: browserProbe,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
