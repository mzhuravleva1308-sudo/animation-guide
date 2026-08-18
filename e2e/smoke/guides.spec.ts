import { test, expect } from "@playwright/test";

const PATH = "/guides/films-like-flow";
const TITLE = "9 Movies Like Flow | Resonale";
const DESCRIPTION =
  "Nine films like Flow to watch next — wordless storytelling, emotional animal characters, and strange, beautiful worlds.";

test.describe("Films like Flow guide", () => {
  test("has dedicated metadata and noindex when the guide is incomplete", async ({ request }) => {
    const response = await request.get(PATH);

    expect(response.status()).toBe(200);
    const html = await response.text();
    const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replaceAll(
      "&amp;",
      "&"
    );
    expect(title).toBe(TITLE);
    expect(html).toContain(DESCRIPTION);
    expect(html).toContain(`https://resonale.com${PATH}`);
    expect(html).toContain(`property="og:title" content="${TITLE}"`);
    expect(html).toContain('property="og:locale" content="en_US"');
    expect(html).not.toMatch(/Beautiful Animated Films to Watch Next/i);

    const unavailable = html.includes("This guide is temporarily unavailable.");
    if (unavailable) {
      expect(html).toMatch(/noindex/i);
    } else {
      expect(html).not.toMatch(/noindex/i);
      expect(html).toMatch(/CollectionPage/);
      expect(html).toMatch(/ItemList/);
    }
  });

  test("renders as a Resonale catalog page, not a blog article", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(PATH);

    await expect(page.getByTestId("guide-page")).toBeVisible();
    await expect(page.getByRole("link", { name: "Resonale home" })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "9 Movies Like Flow",
      })
    ).toBeVisible();
    await expect(
      page.getByText("If you loved Flow, these nine films like it", {
        exact: false,
      })
    ).toBeVisible();
    const anchorPoster = page.getByTestId("guide-anchor-poster");
    if ((await page.getByTestId("film-card").count()) > 0) {
      await expect(anchorPoster).toBeVisible();
    }
    await expect(page.getByTestId("guide-personal-note")).toBeVisible();
    await expect(page.getByTestId("guide-cta")).toHaveAttribute("href", "/");
    await expect(page.getByTestId("guide-cta")).toHaveText(
      "Explore more animation in Resonale"
    );
    await expect(page.getByTestId("guide-section-link")).toHaveAttribute(
      "href",
      "/guides"
    );
    await expect(page.getByTestId("guide-related-index")).toHaveAttribute(
      "href",
      "/guides"
    );
    await expect(page.getByTestId("guide-related-link")).toHaveAttribute(
      "href",
      "/guides/beautiful-animated-films"
    );
    await expect(page.getByTestId("nav-films")).toHaveCount(0);
    await expect(page.getByTestId("nav-saved")).toHaveCount(0);
    await expect(page.getByTestId("auth-status")).toBeVisible();

    const cards = page.getByTestId("film-card");
    const cardCount = await cards.count();
    if (cardCount > 0) {
      await expect(cards).toHaveCount(9);
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "If you loved the wordless storytelling",
        })
      ).toBeVisible();
      await expect(
        page.getByText("These films trust images, movement, and silence", {
          exact: false,
        })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Rate 1 out of 10" }).first()
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Add to watchlist" }).first()
      ).toBeVisible();

      await page.getByRole("button", { name: "Rate 1 out of 10" }).first().click();
      await expect(page.getByTestId("email-auth-modal")).toBeVisible();
    }

    expect(consoleErrors).toEqual([]);
  });
});

const BEAUTIFUL_PATH = "/guides/beautiful-animated-films";
const BEAUTIFUL_TITLE = "Beautiful Animated Films Worth Discovering | Resonale";
const BEAUTIFUL_DESCRIPTION =
  "Beautiful animated films worth discovering: award-winning festival animation, tactile handmade worlds, and quiet atmospheric movies that feel alive.";

test.describe("Beautiful animated films guide", () => {
  test("has dedicated metadata, canonical URL, and JSON-LD when complete", async ({
    request,
  }) => {
    const response = await request.get(BEAUTIFUL_PATH);

    expect(response.status()).toBe(200);
    const html = await response.text();
    const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replaceAll(
      "&amp;",
      "&"
    );
    expect(title).toBe(BEAUTIFUL_TITLE);
    expect(html).toContain(BEAUTIFUL_DESCRIPTION);
    expect(html).toContain(`https://resonale.com${BEAUTIFUL_PATH}`);
    expect(html).toContain(`property="og:title" content="${BEAUTIFUL_TITLE}"`);
    expect(html).toContain('property="og:locale" content="en_US"');
    expect(html).not.toMatch(/Visually Stunning Movies Worth Discovering/);

    const unavailable = html.includes("This guide is temporarily unavailable.");
    if (unavailable) {
      expect(html).toMatch(/noindex/i);
    } else {
      expect(html).not.toMatch(/noindex/i);
      expect(html).toMatch(/CollectionPage/);
      expect(html).toMatch(/ItemList/);
      expect(html).toContain("The Tale of the Princess Kaguya");
    }
  });

  test("renders grouped beautiful animated films as a catalog page", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(BEAUTIFUL_PATH);

    await expect(page.getByTestId("guide-page")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Beautiful Animated Films Worth Discovering",
      })
    ).toBeVisible();
    await expect(
      page.getByText("Beautiful animated films have a way of slowing me down", {
        exact: false,
      })
    ).toBeVisible();
    await expect(
      page.getByText("visually stunning animated movies", { exact: false })
    ).toBeVisible();
    await expect(page.getByTestId("guide-anchor-poster")).toHaveCount(0);
    await expect(page.getByTestId("guide-personal-note")).toBeVisible();
    await expect(page.getByTestId("guide-cta")).toHaveAttribute("href", "/");
    await expect(page.getByTestId("guide-section-link")).toHaveAttribute(
      "href",
      "/guides"
    );
    await expect(page.getByTestId("guide-related-index")).toHaveAttribute(
      "href",
      "/guides"
    );
    await expect(page.getByTestId("guide-related-link")).toHaveAttribute(
      "href",
      "/guides/films-like-flow"
    );

    const cards = page.getByTestId("film-card");
    const cardCount = await cards.count();
    if (cardCount > 0) {
      await expect(cards).toHaveCount(9);
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Award-winning beauty",
        })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Warm, tactile beauty",
        })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Quiet, atmospheric beauty",
        })
      ).toBeVisible();
    }

    expect(consoleErrors).toEqual([]);
  });
});

test.describe("Guides index", () => {
  test("has dedicated metadata and lists both guides", async ({
    request,
    page,
  }) => {
    const response = await request.get("/guides");
    expect(response.status()).toBe(200);
    const html = await response.text();
    const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replaceAll(
      "&amp;",
      "&"
    );
    expect(title).toBe("Guides to Animated Films | Resonale");
    expect(html).toContain("https://resonale.com/guides");
    expect(html).not.toMatch(/noindex/i);

    await page.goto("/guides");
    await expect(page.getByTestId("guides-index")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Guides to Animated Films" })
    ).toBeVisible();
    await expect(page.getByTestId("nav-animation")).toBeVisible();
    await expect(page.getByTestId("auth-status")).toBeVisible();
    await expect(page.getByTestId("guides-index-films-like-flow")).toHaveAttribute(
      "href",
      "/guides/films-like-flow"
    );
    await expect(
      page.getByTestId("guides-index-beautiful-animated-films")
    ).toHaveAttribute("href", "/guides/beautiful-animated-films");
  });
});

test.describe("Guide links in the public footer", () => {
  test("links to the guides index from the catalog homepage", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.getByTestId("footer-guides-link")).toHaveAttribute(
      "href",
      "/guides"
    );
    await expect(page.getByTestId("footer-guides-link")).toHaveText("Guides");
    await expect(page.getByTestId("footer-guide-films-like-flow")).toHaveCount(0);
    await expect(
      page.getByTestId("footer-guide-beautiful-animated-films")
    ).toHaveCount(0);
  });
});
