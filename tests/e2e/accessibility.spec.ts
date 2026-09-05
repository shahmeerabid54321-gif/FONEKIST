import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * A11Y-001: WCAG 2.2 AA is part of Definition of Done (ADR-016).
 *
 * Run in both colour schemes, because a contrast failure that only exists in dark mode is
 * still a failure and is exactly the kind that ships unnoticed.
 *
 * Automated coverage is a floor, not a discharge of A11Y-001: axe cannot judge focus order,
 * announcement quality or whether a control is understandable. Those need a manual pass.
 */
/**
 * Every route a customer can reach without placing an order.
 *
 * Checking only the home page would have said nothing about the comparison table, the
 * filter panel or the application form, which are the three most structurally complicated
 * things on the site and therefore the three most likely to fail.
 */
const ROUTES = [
  "/",
  "/phones",
  "/phones?monthly_max=8000&installments=1",
  "/brands",
  "/brands/samsung",
  "/installments",
  "/installments/status",
  "/compare",
  "/search?q=galaxy",
  "/query",
  "/track",
  "/policies/installments",
] as const;

for (const scheme of ["light", "dark"] as const) {
  test.describe(`colour scheme: ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const route of ROUTES) {
      test(`${route} has no detectable accessibility violations`, async ({ page }) => {
        await page.goto(route);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();

        expect(
          results.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.length,
          })),
        ).toEqual([]);
      });
    }
  });
}

/**
 * The two pages that only exist for a specific product, checked separately because their
 * URLs have to be discovered first.
 */
for (const scheme of ["light", "dark"] as const) {
  test.describe(`product pages, colour scheme: ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("the product page and a comparison have no detectable violations", async ({ page }) => {
      await page.goto("/phones?installments=1&in_stock=1");
      const href = await page.locator("article a[href^='/p/']").first().getAttribute("href");
      expect(href).toBeTruthy();

      for (const route of [href!, `/compare?ids=${href!.replace("/p/", "")}`]) {
        await page.goto(route);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();

        expect(
          results.violations.map((violation) => ({
            route,
            id: violation.id,
            impact: violation.impact,
            nodes: violation.nodes.length,
          })),
        ).toEqual([]);
      }
    });
  });
}
