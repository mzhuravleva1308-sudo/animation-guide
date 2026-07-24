import { test, expect } from "@playwright/test";
import {
  ensureProjectE2eProfile,
} from "../helpers/project-profile-credentials";
import { profilePagePath } from "../helpers/profile-credentials";
import { expandFilmSearch } from "../helpers/profile-page";

async function expectStableSearchInputWidth(
  page: import("@playwright/test").Page,
  path: string,
  options?: { openAllFilmsTab?: boolean }
) {
  await page.goto(path);

  if (options?.openAllFilmsTab) {
    const allFilmsTab = page.getByRole("button", { name: "Films" });
    await expect(allFilmsTab).toBeVisible();
    await allFilmsTab.click();
    await expect(allFilmsTab).toHaveAttribute("aria-pressed", "true");
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
  test("keeps /films search input width stable while typing", async ({ page }) => {
    await expectStableSearchInputWidth(page, "/films");
  });

  test("keeps profile All films search input width stable while typing", async ({
    page,
  }, testInfo) => {
    const credentials = await ensureProjectE2eProfile(testInfo.project.name);
    await expectStableSearchInputWidth(page, profilePagePath(credentials), {
      openAllFilmsTab: true,
    });
  });
});
