import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("renders a unified email sign-in screen", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByTestId("oauth-google")).toHaveCount(0);
    await expect(page.getByTestId("oauth-apple")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Email link" })).toBeVisible();
    await expect(page.getByTestId("login-email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send sign-in link" })
    ).toBeVisible();
    await expect(page.getByTestId("login-password")).toHaveCount(0);
    await expect(page.getByTestId("login-create-account")).toHaveCount(0);
    await expect(page.getByTestId("login-use-password")).toHaveCount(0);
    await expect(page.getByTestId("auth-status")).toHaveCount(0);
    await expect(page.getByTestId("login-privacy-link")).toHaveAttribute(
      "href",
      "/privacy"
    );
  });
});

test.describe("Account control", () => {
  test("shows login link on the home page when signed out", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /Resonale/i })).toBeVisible();
    await expect(page.getByTestId("auth-status")).toHaveAttribute(
      "aria-label",
      "Log in"
    );
    await expect(page.getByTestId("auth-email")).toHaveCount(0);
  });
});

test.describe("Retired user routes", () => {
  test("redirects /my-profile, /films, /saved, and /watched to the catalog", async ({
    page,
  }) => {
    for (const path of ["/my-profile", "/films", "/saved", "/watched"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId("film-list")).toBeVisible();
    }
  });
});
