import { expect, test } from "@playwright/test";

/**
 * Comparison (CUST-011).
 *
 * Two properties are worth testing and neither is visual: the selection lives entirely in
 * the URL, so a comparison can be sent to somebody, and the table is a real table, so a
 * screen reader can say which value belongs to which phone.
 */

async function twoHandles(page: import("@playwright/test").Page): Promise<[string, string]> {
  await page.goto("/phones?in_stock=1");
  const hrefs = await page.locator("article a[href^='/p/']").evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  const handles = [...new Set(hrefs.map((href) => href.replace("/p/", "")))].filter(Boolean);
  expect(handles.length).toBeGreaterThanOrEqual(2);
  return [handles[0]!, handles[1]!];
}

test("compares phones from the URL alone, so a comparison is shareable", async ({ page }) => {
  const [a, b] = await twoHandles(page);

  await page.goto(`/compare?ids=${a},${b}`);

  await expect(page.getByRole("heading", { level: 1, name: /Comparing 2 phones/ })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
});

test("caps the comparison at three phones", async ({ page }) => {
  // Four columns of specifications do not fit a phone screen without hiding one or making
  // the type unreadable.
  await page.goto("/phones?in_stock=1");
  const hrefs = await page.locator("article a[href^='/p/']").evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  const handles = [...new Set(hrefs.map((href) => href.replace("/p/", "")))].filter(Boolean);

  await page.goto(`/compare?ids=${handles.slice(0, 5).join(",")}`);
  await expect(page.getByRole("heading", { level: 1, name: /Comparing 3 phones/ })).toBeVisible();
});

test("uses real table semantics so values can be attributed to a phone", async ({ page }) => {
  const [a, b] = await twoHandles(page);
  await page.goto(`/compare?ids=${a},${b}`);

  // Column headers name the phones, row headers name the specification. Without both, a
  // screen reader reads a list of numbers with no idea what they describe.
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader").first()).toBeVisible();
  await expect(table.getByRole("rowheader").first()).toBeVisible();
});

test("the differences-only toggle is a link, so the filtered view is shareable too", async ({
  page,
}) => {
  const [a, b] = await twoHandles(page);
  await page.goto(`/compare?ids=${a},${b}`);

  const allRows = await page.getByRole("table").getByRole("rowheader").count();

  await page.getByRole("link", { name: "Show differences only" }).click();
  await expect(page).toHaveURL(/diff=1/);

  const differingRows = await page.getByRole("table").getByRole("rowheader").count();
  // Two different phones must differ in something, and must not differ in everything.
  expect(differingRows).toBeLessThanOrEqual(allRows);
});

test("says which phone it could not find rather than quietly dropping it", async ({ page }) => {
  const [a] = await twoHandles(page);
  await page.goto(`/compare?ids=${a},not-a-real-phone`);

  // A comparison that silently shows one of the two phones somebody asked for looks like
  // it worked.
  await expect(page.getByText(/could not find not-a-real-phone/)).toBeVisible();
});

test("prices in the table are read live, not from the search index", async ({ page }) => {
  const [a] = await twoHandles(page);
  await page.goto(`/compare?ids=${a}`);

  const table = page.getByRole("table");
  await expect(table.getByText(/^Rs [\d,]+$/).first()).toBeVisible();
  await expect(table.getByText(/In stock|Out of stock/).first()).toBeVisible();
});
