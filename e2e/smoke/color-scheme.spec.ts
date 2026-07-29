import { test, expect, type Page } from "@playwright/test";

async function assertLightPalette(page: Page) {
  await page.goto("/");

  await expect(page.getByRole("link", { name: /Resonale/i })).toBeVisible();
  await expect(page.getByTestId("film-list")).toBeVisible();

  const palette = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const rootStyles = getComputedStyle(root);
    const bodyStyles = getComputedStyle(body);

    function luminance(color: string): number {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!match) {
        return -1;
      }
      const [r, g, b] = match.slice(1, 4).map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }

    const searchExpand = document.querySelector(
      '[data-testid="film-search-expand"]'
    );
    const filmCard = document.querySelector('[data-testid="film-card"]');
    const titleButton = filmCard?.querySelector(
      "button[title='Click to copy title']"
    );

    return {
      colorScheme: rootStyles.colorScheme,
      bodyBackground: bodyStyles.backgroundColor,
      bodyColor: bodyStyles.color,
      bodyBackgroundLuminance: luminance(bodyStyles.backgroundColor),
      bodyColorLuminance: luminance(bodyStyles.color),
      searchExpandBackground: searchExpand
        ? getComputedStyle(searchExpand).backgroundColor
        : null,
      searchExpandBackgroundLuminance: searchExpand
        ? luminance(getComputedStyle(searchExpand).backgroundColor)
        : -1,
      titleColor: titleButton ? getComputedStyle(titleButton).color : null,
      titleColorLuminance: titleButton
        ? luminance(getComputedStyle(titleButton).color)
        : -1,
      cssBackgroundVar: rootStyles.getPropertyValue("--background").trim(),
      cssForegroundVar: rootStyles.getPropertyValue("--foreground").trim(),
    };
  });

  expect(palette.colorScheme).toContain("light");
  expect(["#fff", "#ffffff"]).toContain(
    palette.cssBackgroundVar.toLowerCase()
  );
  expect(palette.cssForegroundVar.toLowerCase()).toBe("#171717");
  // Page stays light: bright background, dark text.
  expect(palette.bodyBackgroundLuminance).toBeGreaterThan(0.9);
  expect(palette.bodyColorLuminance).toBeLessThan(0.2);
  // Search control keeps a light chip background (not inverted by UA dark styling).
  expect(palette.searchExpandBackgroundLuminance).toBeGreaterThan(0.85);
  // Film titles inherit body foreground (must stay dark on light page).
  expect(palette.titleColorLuminance).toBeLessThan(0.2);
}

test.describe("Forced light palette", () => {
  test("keeps light Resonale colors under prefers-color-scheme: light", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await assertLightPalette(page);
  });

  test("keeps light Resonale colors under prefers-color-scheme: dark", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await assertLightPalette(page);
  });
});
