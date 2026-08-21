import { test, expect } from "@playwright/test";

const PATH = "/guides/films-like-flow";
const TITLE = "9 Movies Like Flow | Resonale";
const DESCRIPTION =
  "Nine films like Flow to watch next — quiet storytelling, emotional animal characters, and strange, beautiful worlds.";

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
      page.getByText("What struck me most about Flow", {
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
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Beautiful animated films",
      })
    ).toHaveAttribute("href", "/guides/beautiful-animated-films");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Weird animated movies",
      })
    ).toHaveAttribute("href", "/guides/weird-animated-movies");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Non-Disney animated movies",
      })
    ).toHaveAttribute("href", "/guides/non-disney-animated-movies");
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
          name: "If you loved how quiet it felt",
        })
      ).toBeVisible();
      await expect(
        page.getByText("These films are very quiet", {
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
      expect(html).toContain("Tito and the Birds");
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
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "9 Movies Like Flow",
      })
    ).toHaveAttribute("href", "/guides/films-like-flow");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Weird animated movies",
      })
    ).toHaveAttribute("href", "/guides/weird-animated-movies");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Animation styles",
      })
    ).toHaveAttribute("href", "/guides/animation-styles");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Non-Disney animated movies",
      })
    ).toHaveAttribute("href", "/guides/non-disney-animated-movies");

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

const WEIRD_PATH = "/guides/weird-animated-movies";
const WEIRD_TITLE =
  "Weird Animated Movies: Strange Films You Probably Haven’t Seen | Resonale";
const WEIRD_DESCRIPTION =
  "Weird animated movies worth discovering: strange independent and festival films where the world, the story, or familiar things refuse to behave.";

test.describe("Weird animated movies guide", () => {
  test("has dedicated metadata, canonical URL, and JSON-LD when complete", async ({
    request,
  }) => {
    const response = await request.get(WEIRD_PATH);

    expect(response.status()).toBe(200);
    const html = await response.text();
    const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replaceAll(
      "&amp;",
      "&"
    );
    expect(title).toBe(WEIRD_TITLE);
    expect(html).toContain(WEIRD_DESCRIPTION);
    expect(html).toContain(`https://resonale.com${WEIRD_PATH}`);
    expect(html).toContain(`property="og:title" content="${WEIRD_TITLE}"`);
    expect(html).toContain('property="og:locale" content="en_US"');

    const unavailable = html.includes("This guide is temporarily unavailable.");
    if (unavailable) {
      expect(html).toMatch(/noindex/i);
    } else {
      expect(html).not.toMatch(/noindex/i);
      expect(html).toMatch(/CollectionPage/);
      expect(html).toMatch(/ItemList/);
      expect(html).toContain("Nobody");
      expect(html).toContain("Have a Nice Day");
    }
  });

  test("renders grouped weird animated movies as a catalog page", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(WEIRD_PATH);

    await expect(page.getByTestId("guide-page")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Weird Animated Movies: Strange Films You Probably Haven’t Seen",
      })
    ).toBeVisible();
    await expect(
      page.getByText("Sometimes we want something stranger", {
        exact: false,
      })
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
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Beautiful animated films",
      })
    ).toHaveAttribute("href", "/guides/beautiful-animated-films");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "9 Movies Like Flow",
      })
    ).toHaveAttribute("href", "/guides/films-like-flow");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Non-Disney animated movies",
      })
    ).toHaveAttribute("href", "/guides/non-disney-animated-movies");

    const cards = page.getByTestId("film-card");
    const cardCount = await cards.count();
    if (cardCount > 0) {
      await expect(cards).toHaveCount(9);
      await expect(page.getByTestId("guide-film-note")).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "When the world makes no normal sense",
        })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "When the story runs on dream logic",
        })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "When everything feels slightly wrong",
        })
      ).toBeVisible();
      await expect(
        page.getByText("worlds that are fundamentally unlike ours", {
          exact: false,
        })
      ).toBeVisible();
    }

    expect(consoleErrors).toEqual([]);
  });
});

const STYLES_PATH = "/guides/animation-styles";
const STYLES_TITLE = "Animation Styles: A Visual Guide to Different Types | Resonale";
const STYLES_DESCRIPTION =
  "Explore different animation styles, from hand-drawn 2D and stop motion to rotoscoping, experimental animation, painterly and watercolor styles, with film examples.";

test.describe("Animation styles guide", () => {
  test("has dedicated metadata, canonical URL, and JSON-LD when complete", async ({
    request,
  }) => {
    const response = await request.get(STYLES_PATH);

    expect(response.status()).toBe(200);
    const html = await response.text();
    const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replaceAll(
      "&amp;",
      "&"
    );
    expect(title).toBe(STYLES_TITLE);
    expect(html).toContain(STYLES_DESCRIPTION);
    expect(html).toContain(`https://resonale.com${STYLES_PATH}`);
    expect(html).toContain(`property="og:title" content="${STYLES_TITLE}"`);
    expect(html).toContain('property="og:locale" content="en_US"');

    const unavailable = html.includes("This guide is temporarily unavailable.");
    if (unavailable) {
      expect(html).toMatch(/noindex/i);
    } else {
      expect(html).not.toMatch(/noindex/i);
      expect(html).toMatch(/CollectionPage/);
      expect(html).toMatch(/ItemList/);
      expect(html).toContain("Josep");
      expect(html).toContain("The Illusionist");
    }
  });

  test("renders grouped animation styles as a catalog page", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(STYLES_PATH);

    await expect(page.getByTestId("guide-page")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Animation Styles: A Visual Guide to Different Types of Animation",
      })
    ).toBeVisible();
    await expect(
      page.getByText("Animation styles are often easier to feel than to name", {
        exact: false,
      })
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
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Beautiful animated films",
      })
    ).toHaveAttribute("href", "/guides/beautiful-animated-films");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "9 Movies Like Flow",
      })
    ).toHaveAttribute("href", "/guides/films-like-flow");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Weird animated movies",
      })
    ).toHaveAttribute("href", "/guides/weird-animated-movies");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Non-Disney animated movies",
      })
    ).toHaveAttribute("href", "/guides/non-disney-animated-movies");

    const cards = page.getByTestId("film-card");
    const cardCount = await cards.count();
    if (cardCount > 0) {
      await expect(cards).toHaveCount(19);
      await expect(page.getByTestId("guide-film-note")).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Hand-drawn and traditional 2D animation",
        })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "3D animation",
        })
      ).toBeVisible();
      await expect(
        page.getByText("2D animation movies", { exact: false })
      ).toBeVisible();
      await expect(
        page.getByText("artistic animation", { exact: false })
      ).toBeVisible();
    }

    expect(consoleErrors).toEqual([]);
  });
});

const NON_DISNEY_PATH = "/guides/non-disney-animated-movies";
const NON_DISNEY_TITLE =
  "Non-Disney Animated Movies Beyond the Big Studios | Resonale";
const NON_DISNEY_DESCRIPTION =
  "Non-Disney animated movies beyond the big studios: nine independent and festival films with real wonder, handmade worlds, and stories Disney would not tell.";

test.describe("Non-Disney animated movies guide", () => {
  test("has dedicated metadata, canonical URL, and JSON-LD when complete", async ({
    request,
  }) => {
    const response = await request.get(NON_DISNEY_PATH);

    expect(response.status()).toBe(200);
    const html = await response.text();
    const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "").replaceAll(
      "&amp;",
      "&"
    );
    expect(title).toBe(NON_DISNEY_TITLE);
    expect(html).toContain(NON_DISNEY_DESCRIPTION);
    expect(html).toContain(`https://resonale.com${NON_DISNEY_PATH}`);
    expect(html).toContain(`property="og:title" content="${NON_DISNEY_TITLE}"`);
    expect(html).toContain('property="og:locale" content="en_US"');

    const unavailable = html.includes("This guide is temporarily unavailable.");
    if (unavailable) {
      expect(html).toMatch(/noindex/i);
    } else {
      expect(html).not.toMatch(/noindex/i);
      expect(html).toMatch(/CollectionPage/);
      expect(html).toMatch(/ItemList/);
      expect(html).toContain("The Painting");
      expect(html).toContain("Sultana's Dream");
    }
  });

  test("renders grouped non-Disney animated movies as a catalog page", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(NON_DISNEY_PATH);

    await expect(page.getByTestId("guide-page")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Non-Disney Animated Movies: A World Beyond the Big Studios",
      })
    ).toBeVisible();
    await expect(
      page.getByText("When I say I love cartoons", {
        exact: false,
      })
    ).toBeVisible();
    await expect(
      page.getByText("non-Disney animated movies", { exact: false })
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
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "9 Movies Like Flow",
      })
    ).toHaveAttribute("href", "/guides/films-like-flow");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Beautiful animated films",
      })
    ).toHaveAttribute("href", "/guides/beautiful-animated-films");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Weird animated movies",
      })
    ).toHaveAttribute("href", "/guides/weird-animated-movies");
    await expect(
      page.getByTestId("guide-related").getByRole("link", {
        name: "Animation styles",
      })
    ).toHaveAttribute("href", "/guides/animation-styles");

    const cards = page.getByTestId("film-card");
    const cardCount = await cards.count();
    if (cardCount > 0) {
      await expect(cards).toHaveCount(9);
      await expect(page.getByTestId("guide-film-note")).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "If you wanted a sense of wonder",
        })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "When the film is built by hand",
        })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Stories the big studios would not tell",
        })
      ).toBeVisible();
    }

    expect(consoleErrors).toEqual([]);
  });
});

test.describe("Guides index", () => {
  test("has dedicated metadata and lists editorial guides", async ({
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
    await expect(
      page.getByTestId("guides-index-weird-animated-movies")
    ).toHaveAttribute("href", "/guides/weird-animated-movies");
    await expect(
      page.getByTestId("guides-index-animation-styles")
    ).toHaveAttribute("href", "/guides/animation-styles");
    await expect(
      page.getByTestId("guides-index-cover-films-like-flow")
    ).toBeVisible();
    await expect(
      page.getByTestId("guides-index-cover-beautiful-animated-films")
    ).toBeVisible();
    await expect(
      page.getByTestId("guides-index-cover-weird-animated-movies")
    ).toBeVisible();
    await expect(
      page.getByTestId("guides-index-cover-animation-styles")
    ).toBeVisible();
    await expect(
      page.getByTestId("guides-index-non-disney-animated-movies")
    ).toHaveAttribute("href", "/guides/non-disney-animated-movies");
    await expect(
      page.getByTestId("guides-index-cover-non-disney-animated-movies")
    ).toBeVisible();
  });

  test("article titles open the guide pages", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/guides");
    await page.getByTestId("guides-index-films-like-flow").click();

    await expect(page).toHaveURL("/guides/films-like-flow");
    await expect(page.getByTestId("guide-page")).toBeVisible();
    expect(pageErrors.join("\n")).not.toMatch(/Maximum update depth exceeded/i);
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
    await expect(
      page.getByTestId("footer-guide-weird-animated-movies")
    ).toHaveCount(0);
  });
});
