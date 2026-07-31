import { expect, type Page } from "@playwright/test";
import type { ProfileTestCredentials } from "./profile-credentials";

/**
 * Opens the live catalog (/). Share-link profile URLs (/p/...?token=) are
 * retired — authenticated profile state lives on the home catalog.
 * `credentials` is kept for call-site compatibility (reset helpers still use it).
 *
 * Skips navigation when already on `/` so a preceding sign-in does not remount
 * and race-overwrite optimistic rating state.
 */
export async function gotoProfilePage(
  page: Page,
  _credentials?: ProfileTestCredentials
) {
  const pathname = new URL(page.url()).pathname;
  if (pathname !== "/") {
    await page.goto("/");
  }

  await expect(page.getByRole("link", { name: /Resonale/i })).toBeVisible();
  await expect(
    page.getByText(
      "Find strange, beautiful and emotionally resonant animated films to watch next."
    )
  ).toBeVisible();
  await expect(page.getByTestId("film-list")).toBeVisible();
  await expect(page.getByTestId("films-page")).toHaveAttribute(
    "data-ratings-ready",
    "true"
  );
}

export async function openProfileTab(
  page: Page,
  tabName: "All films" | "Films" | "All" | "Saved" | "Watched"
) {
  const resolvedName =
    tabName === "All films" || tabName === "Films" ? "All" : tabName;

  const tabButton = page.getByRole("button", {
    name: resolvedName,
    exact: true,
  });
  await tabButton.click();
  await expect(tabButton).toHaveAttribute("aria-pressed", "true");

  if (resolvedName === "All") {
    await expect(page.getByTestId("film-search")).toBeVisible();
  }
}

export async function expandFilmSearch(page: Page) {
  const input = page.getByTestId("film-search-input");
  if (await input.isVisible()) {
    return input;
  }

  await page.getByTestId("film-search-expand").click();
  await expect(input).toBeVisible();
  return input;
}

export function filmList(page: Page) {
  return page.getByTestId("film-list");
}

export function tabEmptyState(page: Page) {
  return page.getByTestId("profile-tab-empty");
}

export function filmCards(page: Page) {
  return filmList(page).getByTestId("film-card");
}

export function firstFilmCard(page: Page) {
  return filmCards(page).first();
}

export function firstUnratedFilmCard(page: Page) {
  return filmCards(page)
    .filter({ hasNotText: /My rating: \d+\/10/ })
    .first();
}

export function filmCardByTitle(page: Page, filmTitle: string) {
  return filmCards(page).filter({
    has: page.getByRole("button", { name: `Copy ${filmTitle}` }),
  });
}

export async function filmTitleFromCard(
  card: ReturnType<typeof firstFilmCard>
): Promise<string> {
  const copyButton = card.getByRole("button", { name: /^Copy / });
  const ariaLabel = await copyButton.getAttribute("aria-label");
  return ariaLabel?.replace(/^Copy /, "") ?? "";
}

/** Partial query long enough to match, skipping leading articles like "The ". */
export function searchPartialFromTitle(title: string): string {
  const withoutArticle = title.replace(/^(the|a|an)\s+/i, "").trim();
  const source = withoutArticle.length >= 2 ? withoutArticle : title.trim();
  return source.slice(0, Math.min(4, source.length));
}

export function filmCardByFilmId(page: Page, filmId: string) {
  return page.locator(`[data-testid="film-card"][data-film-id="${filmId}"]`);
}

export async function findFilmCardInAllFilmsList(page: Page, filmId: string) {
  const cardInList = () =>
    filmList(page).locator(
      `[data-testid="film-card"][data-film-id="${filmId}"]`
    );

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const card = cardInList();
    if ((await card.count()) > 0) {
      await card.scrollIntoViewIfNeeded();
      return card;
    }

    const nextButton = page.getByRole("button", { name: "Next", exact: true });
    if ((await nextButton.count()) === 0) {
      break;
    }

    await nextButton.click();
    await expect(filmList(page)).toBeVisible();
  }

  throw new Error(`Film ${filmId} not found in All films list`);
}

export async function expectTabIsEmpty(page: Page) {
  await expect(page.getByTestId("films-page")).toHaveAttribute(
    "data-ratings-ready",
    "true"
  );
  await expect(page.getByTestId("profile-tab-loading")).toHaveCount(0);
  await expect(filmCards(page)).toHaveCount(0);
  await expect(tabEmptyState(page)).toBeVisible();
}

export async function expectTabHasFilms(page: Page, count?: number) {
  if (count == null) {
    await expect(filmCards(page).first()).toBeVisible();
  } else {
    await expect(filmCards(page)).toHaveCount(count);
  }

  await expect(tabEmptyState(page)).not.toBeVisible();
}

export async function rateFilmOnCard(
  card: ReturnType<typeof firstFilmCard>,
  rating: number
) {
  const button = card.getByRole("button", {
    name: `Rate ${rating} out of 10`,
  });

  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeEnabled();
  await button.click();
}

export async function waitForWatchlistButton(
  card: ReturnType<typeof firstFilmCard>,
  label: "Add to watchlist" | "Remove from watchlist"
) {
  const button = card.getByRole("button", { name: label });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  return button;
}

export async function unsaveAllVisibleFilms(page: Page) {
  await openProfileTab(page, "Saved");

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await filmCards(page).count()) === 0) {
      break;
    }

    const removeButton = await waitForWatchlistButton(
      filmCards(page).first(),
      "Remove from watchlist"
    );

    await removeButton.click();
    await expect(page.getByTestId("toast")).toContainText("Removed from Saved.");
    await expect(filmCards(page)).toHaveCount(0, { timeout: 10_000 });
  }

  await expectTabIsEmpty(page);

  await page.reload();
  await expect(page.getByRole("link", { name: /Resonale/i })).toBeVisible();
  await openProfileTab(page, "Saved");
  await expectTabIsEmpty(page);
}
