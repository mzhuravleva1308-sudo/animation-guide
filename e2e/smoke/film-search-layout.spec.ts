import { test, expect } from "@playwright/test";
import { expandFilmSearch } from "../helpers/profile-page";

async function expectStableSearchInputWidth(
  page: import("@playwright/test").Page,
  path: string,
  options?: { openAllFilmsTab?: boolean }
) {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    await page.goto(path);
  } else {
    await page.goto(path);
  }
  await expect(page.getByTestId("film-list")).toBeVisible();
  await expect(page.getByTestId("film-search")).toBeVisible();

  if (options?.openAllFilmsTab) {
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByTestId("film-search")).toBeVisible();
  }

  const input = await expandFilmSearch(page);
  const searchSection = page.getByTestId("film-search");
  const main = page.locator("main");

  const widthBefore = (await input.boundingBox())?.width ?? 0;
  const sectionWidthBefore = (await searchSection.boundingBox())?.width ?? 0;
  const mainWidthBefore = (await main.boundingBox())?.width ?? 0;

  expect(widthBefore).toBeGreaterThan(0);
  expect(sectionWidthBefore).toBeGreaterThan(0);
  expect(mainWidthBefore).toBeGreaterThan(0);

  await input.fill("a");
  await expect(page.getByTestId("film-search-hint")).toBeVisible();
  const widthOneChar = (await input.boundingBox())?.width ?? 0;
  const sectionWidthOneChar = (await searchSection.boundingBox())?.width ?? 0;
  const mainWidthOneChar = (await main.boundingBox())?.width ?? 0;

  await input.fill("anim");
  await expect(page.getByTestId("film-search-loading")).toBeVisible({
    timeout: 10_000,
  });
  const widthWhileLoading = (await input.boundingBox())?.width ?? 0;
  const sectionWidthWhileLoading =
    (await searchSection.boundingBox())?.width ?? 0;
  const mainWidthWhileLoading = (await main.boundingBox())?.width ?? 0;

  await expect(page.getByTestId("film-search-results")).toBeVisible({
    timeout: 10_000,
  });
  const widthWithResults = (await input.boundingBox())?.width ?? 0;
  const sectionWidthWithResults =
    (await searchSection.boundingBox())?.width ?? 0;
  const mainWidthWithResults = (await main.boundingBox())?.width ?? 0;

  const measurements = {
    input: {
      before: widthBefore,
      oneChar: widthOneChar,
      loading: widthWhileLoading,
      results: widthWithResults,
    },
    section: {
      before: sectionWidthBefore,
      oneChar: sectionWidthOneChar,
      loading: sectionWidthWhileLoading,
      results: sectionWidthWithResults,
    },
    main: {
      before: mainWidthBefore,
      oneChar: mainWidthOneChar,
      loading: mainWidthWhileLoading,
      results: mainWidthWithResults,
    },
  };

  for (const [scope, widths] of Object.entries(measurements)) {
    for (const [phase, width] of Object.entries(widths)) {
      if (phase === "before") {
        continue;
      }

      expect
        .soft(Math.abs(width - widths.before), `${scope} ${phase}`)
        .toBeLessThanOrEqual(1);
    }
  }
}

test.describe("Film search layout stability", () => {
  test("keeps catalog search input width stable while typing after /films redirect", async ({
    page,
  }) => {
    await page.goto("/films");
    await expect(page).toHaveURL(/\/(?:\?[^/]*)?$/);
    await expectStableSearchInputWidth(page, page.url());
  });

  test("keeps home All films search input width stable while typing", async ({
    page,
  }) => {
    await expectStableSearchInputWidth(page, "/", {
      openAllFilmsTab: true,
    });
  });
});
