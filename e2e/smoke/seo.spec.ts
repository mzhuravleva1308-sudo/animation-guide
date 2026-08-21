import { test, expect } from "@playwright/test";

const EXPECTED_DESCRIPTION =
  "Find distinctive, beautiful and emotionally resonant animation and films to watch next.";

test.describe("Public SEO basics", () => {
  test("home title and description use the Resonale brand", async ({
    request,
  }) => {
    const response = await request.get("/");

    expect(response.status()).toBe(200);
    const html = await response.text();
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    expect(title).toContain("Resonale");
    expect(title).toMatch(/Animation/);
    expect(title).toMatch(/Film Guide/);
    expect(html).toContain(`content="${EXPECTED_DESCRIPTION}"`);
  });

  test("filter query URLs canonicalize to the homepage", async ({
    request,
  }) => {
    const response = await request.get("/?filter=sci-fi");

    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/rel="canonical"/);
    expect(html).toContain("https://resonale.com");
    expect(html).not.toMatch(/rel="canonical"[^>]*filter=/);
  });

  test("robots.txt allows the catalog and points at the production sitemap", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");

    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /admin/");
    expect(body).toContain("Disallow: /login");
    expect(body).toContain("Disallow: /auth/");
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /p/");
    expect(body).toContain("Sitemap: https://resonale.com/sitemap.xml");
    expect(body).not.toMatch(/Disallow:\s*\/_next/i);
  });

  test("sitemap.xml lists the public homepage and editorial guides, not legal pages", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");

    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("https://resonale.com/");
    expect(body).toContain("<loc>https://resonale.com/guides</loc>");
    expect(body).toContain(
      "<loc>https://resonale.com/guides/films-like-flow</loc>"
    );
    expect(body).toContain(
      "<loc>https://resonale.com/guides/beautiful-animated-films</loc>"
    );
    expect(body).toContain(
      "<loc>https://resonale.com/guides/weird-animated-movies</loc>"
    );
    expect(body).toContain(
      "<loc>https://resonale.com/guides/animation-styles</loc>"
    );
    expect(body).toContain(
      "<loc>https://resonale.com/guides/non-disney-animated-movies</loc>"
    );
    expect(body).toContain("<lastmod>");
    expect(body).not.toContain("https://resonale.com/privacy");
    expect(body).not.toContain("https://resonale.com/contact");
    expect(body).toContain("<urlset");
    expect(body).not.toContain("?media=");
  });
});
