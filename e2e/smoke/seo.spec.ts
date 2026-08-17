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

  test("sitemap.xml lists the public homepage, the Flow guide, and privacy", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml");

    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain("https://resonale.com/");
    expect(body).toContain("https://resonale.com/guides/films-like-flow");
    expect(body).toContain("https://resonale.com/privacy");
    expect(body).toContain("<urlset");
    expect(body).not.toContain("?media=");
  });
});
