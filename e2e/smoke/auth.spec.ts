import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test("renders a unified sign-in screen", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByTestId("oauth-google")).toHaveCount(0);
    await expect(page.getByTestId("oauth-apple")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Email sign-in" })).toBeVisible();
    await expect(page.getByTestId("login-email")).toBeVisible();
    await expect(page.getByTestId("login-password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByTestId("login-create-account")).toBeVisible();
    await expect(page.getByTestId("login-use-magic-link")).toBeVisible();
    await expect(
      page.getByTestId("auth-status").getByRole("link", { name: "Log in" })
    ).toBeVisible();
  });

  test("switches email sign-in to magic link mode", async ({ page }) => {
    await page.goto("/login");

    await page.getByTestId("login-use-magic-link").click();

    await expect(
      page.getByRole("button", { name: "Send sign-in link" })
    ).toBeVisible();
    await expect(page.getByTestId("login-password")).toHaveCount(0);
    await expect(page.getByTestId("login-use-password")).toBeVisible();
  });
});

test.describe("Auth header", () => {
  test("shows login link when signed out", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("auth-status")).toContainText("Log in");
    await expect(page.getByTestId("auth-email")).toHaveCount(0);
  });
});

test.describe("My profile", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/my-profile");

    await expect(page).toHaveURL(/\/login$/);
  });
});
