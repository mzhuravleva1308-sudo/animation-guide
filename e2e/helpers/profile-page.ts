import { expect, type Page } from "@playwright/test";
import {
  profilePagePath,
  type ProfileTestCredentials,
} from "./profile-credentials";

export async function gotoProfilePage(
  page: Page,
  credentials: ProfileTestCredentials
) {
  await page.goto(profilePagePath(credentials));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Animation Guide"
  );
}

export async function openProfileTab(
  page: Page,
  tabName: "All films" | "Saved" | "Watched"
) {
  const tabButton = page.getByRole("button", { name: tabName, exact: true });
  await tabButton.click();
  await expect(tabButton).toHaveClass(/bg-black/);
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
    await expect(filmCards(page)).toHaveCount(0, { timeout: 10_000 });
  }

  await expectTabIsEmpty(page);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Animation Guide"
  );
  await openProfileTab(page, "Saved");
  await expectTabIsEmpty(page);
}
