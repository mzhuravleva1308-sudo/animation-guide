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
    .filter({ hasText: "My rating: not rated yet" })
    .first();
}

export function filmCardByTitle(page: Page, filmTitle: string) {
  return filmCards(page).filter({
    has: page.getByRole("heading", { level: 2, name: filmTitle }),
  });
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
