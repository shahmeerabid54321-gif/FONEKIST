import { expect, test } from "@playwright/test";

/**
 * The query (INST-003, INST-005).
 *
 * The query is what a cart would be on a shop that sold things. It holds handsets somebody
 * is choosing between and the plan they picked for each, and the two things worth testing
 * hardest are the two that make it not a cart: every row carries the full disclosure rather
 * than a monthly figure on its own, and the only action it offers is applying for one
 * handset.
 */

/** Finds a phone that has plans, so the test does not depend on one seeded handset. */
async function phoneWithPlans(page: import("@playwright/test").Page, index = 0): Promise<string> {
  await page.goto("/phones?installments=1&in_stock=1");
  const href = await page
    .locator("article a[href^='/p/']")
    .nth(index)
    .getAttribute("href");
  expect(href).toBeTruthy();
  return href!;
}

test.describe("building a query", () => {
  test("a phone and its plan can be added, and the header says so", async ({ page }) => {
    await page.goto(await phoneWithPlans(page));

    await page.getByRole("button", { name: "Add to query" }).click();
    await expect(page.getByText("On your query.")).toBeVisible();

    // The badge is a server render off a cookie, so it has to survive a navigation rather
    // than only updating the page that set it.
    await page.goto("/phones");
    await expect(page.getByRole("link", { name: /Query/ })).toContainText("1");
  });

  test("a row carries the whole disclosure, not just a monthly figure", async ({ page }) => {
    await page.goto(await phoneWithPlans(page));
    await page.getByRole("button", { name: "Add to query" }).click();
    await expect(page.getByText("On your query.")).toBeVisible();

    await page.goto("/query");

    // The same guarantee the product page gives. A shortlist that quoted "Rs 3,400 a month"
    // per row and left the totals behind would be the exact thing this storefront exists
    // not to do (INST-003).
    const disclosure = page.locator("dl").first();
    await expect(disclosure.getByText("Cash price", { exact: true })).toBeVisible();
    await expect(disclosure.getByText("Advance", { exact: true })).toBeVisible();
    await expect(disclosure.getByText("Monthly", { exact: true })).toBeVisible();
    await expect(disclosure.getByText("Total you pay", { exact: true })).toBeVisible();
    await expect(page.getByText(/more than paying cash/).first()).toBeVisible();
  });

  test("applying from a row carries that variant and that plan", async ({ page }) => {
    await page.goto(await phoneWithPlans(page));
    await page.getByRole("button", { name: "Add to query" }).click();
    await expect(page.getByText("On your query.")).toBeVisible();

    await page.goto("/query");
    await page.getByRole("link", { name: "Apply for this plan" }).first().click();

    // An agreement covers one handset (INST-005), so the query funnels to one application
    // rather than submitting itself.
    await expect(page).toHaveURL(/\/installments\/apply\?variant=.+&plan=.+/);
    await expect(page.getByRole("heading", { name: "The plan you are applying for" })).toBeVisible();
  });

  test("a phone can be removed again", async ({ page }) => {
    await page.goto(await phoneWithPlans(page));
    await page.getByRole("button", { name: "Add to query" }).click();
    await expect(page.getByText("On your query.")).toBeVisible();

    await page.goto("/query");
    await page.getByRole("button", { name: "Remove" }).first().click();

    await expect(page.getByText("Nothing on your query yet")).toBeVisible();
  });

  test("adding the same phone again replaces its plan rather than repeating it", async ({
    page,
  }) => {
    const href = await phoneWithPlans(page);
    await page.goto(href);

    const plans = page.getByRole("button", { name: /\/mo$/ });
    const planCount = await plans.count();
    test.skip(planCount < 2, "needs a handset with more than one tenure");

    await page.getByRole("button", { name: "Add to query" }).click();
    await expect(page.getByText("On your query.")).toBeVisible();

    await plans.nth(1).click();
    await page.getByRole("button", { name: "Add to query" }).click();

    await page.goto("/query");
    // Two plans on one handset is a plan comparison, and the product page already does that
    // better than a list of near-identical rows could.
    await expect(page.getByRole("link", { name: "Apply for this plan" })).toHaveCount(1);
  });
});

test.describe("the empty query", () => {
  test("offers a way out rather than a dead end", async ({ page }) => {
    await page.goto("/query");
    await expect(page.getByText("Nothing on your query yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse phones" })).toBeVisible();
  });
});

test.describe("the routes the cash rail used to own", () => {
  test("/cart and /checkout land on the query instead of a 404", async ({ page }) => {
    // Both were live on the deployed site, so they are in histories and bookmarks. A 404
    // would read as a broken shop rather than a changed one.
    await page.goto("/cart");
    await expect(page).toHaveURL(/\/query$/);

    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/query$/);
  });
});
