import { expect, type Locator, type Page } from "@playwright/test";

type TrailerOverlayExpectations = {
  maxWidthRatio?: number;
  maxHeight?: number;
};

export function firstFilmCardWithTrailer(page: Page, cardList: Locator) {
  return cardList
    .filter({
      has: page.getByTestId("film-trailer-link"),
    })
    .first();
}

export async function expectTrailerOverlayLayout(
  card: Locator,
  expectations: TrailerOverlayExpectations = {}
) {
  const maxWidthRatio = expectations.maxWidthRatio ?? 0.45;
  const maxHeight = expectations.maxHeight ?? 36;

  const poster = card.getByTestId("film-poster");
  const trailer = card.getByTestId("film-trailer-link");

  await expect(poster).toBeVisible();
  await expect(trailer).toBeVisible();

  const posterBox = await poster.boundingBox();
  const trailerBox = await trailer.boundingBox();

  expect(posterBox).not.toBeNull();
  expect(trailerBox).not.toBeNull();

  if (!posterBox || !trailerBox) {
    return;
  }

  const posterCenterX = posterBox.x + posterBox.width / 2;
  const trailerCenterX = trailerBox.x + trailerBox.width / 2;
  const centerOffset = Math.abs(trailerCenterX - posterCenterX);

  expect(trailerBox.width / posterBox.width).toBeLessThanOrEqual(maxWidthRatio);
  expect(trailerBox.height).toBeLessThanOrEqual(maxHeight);
  expect(centerOffset).toBeLessThanOrEqual(2);
  expect(trailerBox.x).toBeGreaterThanOrEqual(posterBox.x - 1);
  expect(trailerBox.y).toBeGreaterThanOrEqual(posterBox.y - 1);
  expect(trailerBox.x + trailerBox.width).toBeLessThanOrEqual(
    posterBox.x + posterBox.width + 1
  );
  expect(trailerBox.y + trailerBox.height).toBeLessThanOrEqual(
    posterBox.y + posterBox.height + 1
  );
}
