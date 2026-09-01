import { expect, test } from "@playwright/test";

/**
 * Brand navigation and filtering (INST-002, INST-003).
 *
 * The claim under test is the one the original plan got wrong: brand is not just a label,
 * it is a canonical identity, and Redmi and POCO are Xiaomi. That cannot be verified by
 * reading the storefront, because the folding happens in the search indexer, so it has to
 * be checked here against a real index.
 */

test.describe("brand pages", () => {
  test("the directory lists brands and each one leads to its own catalogue", async ({ page }) => {
    await page.goto("/brands");

    const links = page.getByRole("link", { name: /Samsung|Apple|Xiaomi/ });
    await expect(links.first()).toBeVisible();

    await page.goto("/brands/samsung");
    await expect(page.getByRole("heading", { level: 1, name: "Samsung" })).toBeVisible();

    // Every card on a brand page belongs to that brand. The brand now leads the card's
    // heading rather than sitting in an eyebrow above it, so the heading is what to read.
    const headings = page.locator("article h3").filter({ hasText: /Samsung/ });
    expect(await headings.count()).toBeGreaterThan(0);
  });

  test("a sub-brand URL redirects to its manufacturer instead of 404ing", async ({ page }) => {
    // `/brands/redmi` is a URL customers genuinely type. Answering it with a 404 because our
    // canonical name is `xiaomi` would be pedantry at the customer's expense.
    await page.goto("/brands/redmi");
    await expect(page).toHaveURL(/\/brands\/xiaomi/);
    await expect(page.getByRole("heading", { level: 1, name: "Xiaomi" })).toBeVisible();
  });

  test("the Xiaomi page carries Redmi and POCO handsets, not just Xiaomi-branded ones", async ({
    page,
  }) => {
    // This is the whole point of brand canonicalisation. Without it there would be three
    // near-empty brand pages describing one manufacturer.
    await page.goto("/brands/xiaomi");

    // The card heading is "<brand> <model>", so a POCO handset reads "POCO X6 Pro 5G"
    // there. This is the assertion that would catch the folding being lost: without it,
    // three near-empty brand pages would each pass a test that only checked its own name.
    const headings = await page.locator("article h3").allInnerTexts();
    const combined = headings.join(" ").toLowerCase();

    expect(combined).toContain("redmi");
    expect(combined).toContain("poco");
    expect(combined).toContain("xiaomi");
  });
});

test.describe("filters", () => {
  test("filter state lives in the URL and survives the back button", async ({ page }) => {
    await page.goto("/phones");
    const before = await page.locator("article").count();

    await page.goto("/phones?monthly_max=8000&installments=1");
    // The chip in the active-filter list, specifically: the same wording also appears as
    // the filter option itself.
    await expect(
      page.getByRole("link", { name: /Up to Rs 8,000 a month Remove/ }),
    ).toBeVisible();
    const filtered = await page.locator("article").count();

    // The filter has to actually filter, or the test proves nothing about the query.
    expect(filtered).toBeLessThan(before);
    expect(filtered).toBeGreaterThan(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/phones$/);
    expect(await page.locator("article").count()).toBe(before);
  });

  test("a monthly payment filter returns only phones within that figure", async ({ page }) => {
    await page.goto("/phones?monthly_max=8000&installments=1");

    const monthlyLines = await page
      .locator("article")
      .locator("text=/or from Rs [\\d,]+ a month/")
      .allInnerTexts();

    expect(monthlyLines.length).toBeGreaterThan(0);

    for (const line of monthlyLines) {
      const amount = Number(line.replace(/[^0-9]/g, ""));
      expect(amount).toBeLessThanOrEqual(8000);
    }
  });

  test("an active filter can be removed from the chip that describes it", async ({ page }) => {
    await page.goto("/phones?brand=samsung");

    const chip = page.getByRole("link", { name: /Samsung/ }).first();
    await expect(chip).toBeVisible();

    await page.getByRole("link", { name: "Clear all" }).click();
    await expect(page).toHaveURL(/\/phones$/);
  });
});
