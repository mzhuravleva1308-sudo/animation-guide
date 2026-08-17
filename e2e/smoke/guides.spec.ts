import { test, expect } from "@playwright/test";

const PATH = "/guides/films-like-flow";
const TITLE = "9 Animated Films Like Flow | Resonale";
const DESCRIPTION =
  "If you loved Flow, these nine animated films share its wordless storytelling, emotional animal characters, and strange, beautiful worlds.";

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

    const unavailable = html.includes("This guide is temporarily unavailable.");
    if (unavailable) {
      expect(html).toMatch(/noindex/i);
    } else {
      expect(html).not.toMatch(/noindex/i);
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
        name: "9 Animated Films Like Flow",
      })
    ).toBeVisible();
    await expect(
      page.getByText("If you loved Flow, these nine animated films", {
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
