import { test, expect } from "@playwright/test";

const PATH = "/privacy";
const TITLE = "Privacy Policy | Resonale";
const DESCRIPTION =
  "How Resonale collects, uses, and stores the data needed to sign you in and remember your film taste.";

test.describe("Privacy Policy", () => {
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

  test("renders the policy and a contact email", async ({ page }) => {
    await page.goto(PATH);

    await expect(page.getByTestId("privacy-policy")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Resonale home" })).toBeVisible();
    await expect(page.getByTestId("privacy-contact-email")).toHaveAttribute(
      "href",
      "mailto:privacy@resonale.com"
    );
  });

  test("is linked from the public catalog footer", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("privacy-policy-link")).toHaveAttribute(
      "href",
      PATH
    );
  });
});
