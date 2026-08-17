import { test, expect } from "@playwright/test";

const PATH = "/contact";
const TITLE = "Contact | Resonale";
const DESCRIPTION =
  "Email Resonale about the guide, your account, or a privacy request.";

test.describe("Contact", () => {
  test("has public metadata and canonical URL", async ({ request }) => {
    const response = await request.get(PATH);

    expect(response.status()).toBe(200);
    const html = await response.text();
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    expect(title).toBe(TITLE);
    expect(html).toContain(DESCRIPTION);
    expect(html).toContain(`https://resonale.com${PATH}`);
    expect(html).not.toMatch(/noindex/i);
  });

  test("renders emails for general and privacy questions", async ({ page }) => {
    await page.goto(PATH);

    await expect(page.getByTestId("contact-page")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Contact" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Resonale home" })).toBeVisible();
    await expect(page.getByTestId("contact-email")).toHaveAttribute(
      "href",
      "mailto:hello@resonale.com"
    );
    await expect(page.getByTestId("contact-privacy-email")).toHaveAttribute(
      "href",
      "mailto:privacy@resonale.com"
    );
  });

  test("is linked from the public catalog footer", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("contact-page-link")).toHaveAttribute(
      "href",
      PATH
    );
  });
});
