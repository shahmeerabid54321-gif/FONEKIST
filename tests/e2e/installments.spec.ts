import { expect, test } from "@playwright/test";

/**
 * Installments (INST-004, INST-005, ADR-023).
 *
 * The disclosure is the thing worth testing hardest. It is the single feature that makes
 * this storefront better than the sites it was modelled on rather than a copy of them, and
 * it is also the easiest thing to lose in a redesign: a monthly figure looks fine on its
 * own, and nobody notices the total is missing until a customer does.
 */

/** Finds a phone that has plans, so the test does not depend on one seeded handset. */
async function firstPhoneWithPlans(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/phones?installments=1&in_stock=1");
  const href = await page.locator("article a[href^='/p/']").first().getAttribute("href");
  expect(href).toBeTruthy();
  return href!;
}

test.describe("the disclosure block", () => {
  test("a monthly figure is never shown without the total beside it", async ({ page }) => {
    await page.goto(await firstPhoneWithPlans(page));


    // Every figure, on one screen, inside the one disclosure block. This is the whole point.
    const disclosure = page.locator("dl").first();
    await expect(disclosure.getByText("Cash price", { exact: true })).toBeVisible();
    await expect(disclosure.getByText("Advance", { exact: true })).toBeVisible();
    await expect(disclosure.getByText("Monthly", { exact: true })).toBeVisible();
    await expect(disclosure.getByText("Total you pay", { exact: true })).toBeVisible();
    await expect(page.getByText(/more than paying cash/)).toBeVisible();
  });

  test("the stated total equals the arithmetic printed beside it", async ({ page }) => {
    await page.goto(await firstPhoneWithPlans(page));

    const rupees = async (label: string): Promise<number> => {
      const row = page.locator("dl div").filter({ hasText: label }).first();
      const text = await row.locator("dd").innerText();
      return Number(text.replace(/[^0-9]/g, ""));
    };

    const advance = await rupees("Advance");
    const total = await rupees("Total you pay");

    const monthlyRow = await page
      .locator("dl div")
      .filter({ hasText: "Monthly" })
      .first()
      .locator("dd")
      .innerText();

    // "Rs 10,400 x 12 = Rs 124,800"
    const parts = monthlyRow.match(/Rs ([\d,]+) x (\d+) = Rs ([\d,]+)/);
    expect(parts).toBeTruthy();

    const monthly = Number(parts![1]!.replace(/,/g, ""));
    const tenure = Number(parts![2]);
    const monthlyTotal = Number(parts![3]!.replace(/,/g, ""));

    // A page that prints arithmetic the reader can check has to survive being checked.
    expect(monthlyTotal).toBe(monthly * tenure);
    expect(total).toBe(advance + monthlyTotal);
  });

  test("the difference from cash is stated in rupees, not only as a percentage", async ({
    page,
  }) => {
    await page.goto(await firstPhoneWithPlans(page));

    const difference = page.getByText(/more than paying cash/);
    await expect(difference).toBeVisible();
    // Rupees is the number the customer actually pays; a percentage alone is the figure
    // that gets quietly reframed.
    await expect(difference).toContainText(/Rs [\d,]+/);
  });

  test("there is no way to buy the handset outright", async ({ page }) => {
    await page.goto(await firstPhoneWithPlans(page));

    // The cash rail is gone. What used to be a "Pay in full" tab beside a live "Add to
    // cart" button is now nothing at all, because this storefront sells on installments
    // only and a control that starts a purchase it cannot finish is worse than no control.
    await expect(page.getByRole("tab", { name: "Pay in full" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
    await expect(page.locator("a[href='/cart'], a[href='/checkout']")).toHaveCount(0);

    // The cash price survives as the comparison figure and nowhere else: it is the first
    // row of the disclosure and the thing "more than paying cash" is measured against.
    // Outside that block it would read as a price somebody could pay (ADR-025).
    await expect(page.locator("dl").first().getByText("Cash price", { exact: true })).toBeVisible();
  });

  test("the plans are on screen without pressing anything", async ({ page }) => {
    await page.goto(await firstPhoneWithPlans(page));

    // The disclosure used to sit behind a tab most people never pressed, which meant the
    // one thing this site does better than its references was optional. INST-004 now holds
    // by construction: there is no state in which the panel shows less than everything.
    await expect(page.getByRole("group", { name: /Choose a plan/i })).toBeVisible();
    await expect(page.getByText("Total you pay")).toBeVisible();
  });
});

test.describe("the application", () => {
  test("shows the terms in full and the plan above the form", async ({ page }) => {
    await page.goto(await firstPhoneWithPlans(page));
    await page.getByRole("link", { name: "Apply for this plan" }).click();

    await expect(page).toHaveURL(/\/installments\/apply/);

    // The figures stay on screen while the customer decides to hand over a CNIC.
    await expect(page.getByRole("heading", { name: "The plan you are applying for" })).toBeVisible();
    // Scoped to what is actually on screen. Under Cache Components, React keeps the route
    // you navigated away from mounted and hidden (`<Activity>`), so after a click through
    // from a product page the previous page's plan panel is still in the document. It is
    // `display: none` and no user or screen reader sees it, but an unscoped text locator
    // matches it and fails on strict mode.
    await expect(page.getByText("Total you pay").locator("visible=true")).toBeVisible();

    // The exact wording shown is what gets stored with the application (SEC-008), so it has
    // to be readable on the page rather than behind a link.
    await expect(page.getByRole("region", { name: "Installment terms" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Installment terms" }),
    ).toContainText("This is a purchase in installments, not a loan");
  });

  test("cannot be submitted before the documents are uploaded", async ({ page }) => {
    await page.goto(await firstPhoneWithPlans(page));
    await page.getByRole("link", { name: "Apply for this plan" }).click();

    await expect(page.getByRole("button", { name: "Submit application" })).toBeDisabled();
    await expect(page.getByText(/Still needed:/)).toBeVisible();
  });

  test("says plainly that nothing is charged", async ({ page }) => {
    await page.goto(await firstPhoneWithPlans(page));
    await page.getByRole("link", { name: "Apply for this plan" }).click();

    await expect(page.getByText(/Nothing is charged when you/).first()).toBeVisible();
  });

  test("clears sensitive application fields when the customer navigates away", async ({
    page,
  }) => {
    await page.goto(await firstPhoneWithPlans(page));
    await page.getByRole("link", { name: "Apply for this plan" }).click();

    const cnic = page.locator("input[name='applicant_cnic']:visible");
    const income = page.locator("input[name='monthly_income']:visible");
    await cnic.fill("42101-1234567-1");
    await income.fill("125000");

    await page.getByRole("link", { name: "Phones", exact: true }).first().click();
    await expect(page).toHaveURL(/\/phones/);

    // Cache Components leaves the application route mounted inside a hidden Activity.
    // The route may remain in the DOM, but identity and financial values must not.
    await expect(page.locator("input[name='applicant_cnic']")).toHaveValue("");
    await expect(page.locator("input[name='monthly_income']")).toHaveValue("");

    await page.goBack();
    await expect(page.locator("input[name='applicant_cnic']:visible")).toHaveValue("");
    await expect(page.locator("input[name='monthly_income']:visible")).toHaveValue("");
  });
});

test.describe("application status", () => {
  test("an unknown reference and a wrong phone give the same answer", async ({ page }) => {
    // Distinguishable answers would let somebody walk the reference space to discover which
    // applications exist (SEC-004).
    await page.goto("/installments/status?reference=FK-00000000&phone=03001234567");
    // Scoped to the page's own content. Next renders its route announcer as a second
    // `role="alert"` in the body, and now that this result streams in rather than arriving
    // with the document, both are present when the assertion runs.
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "We could not find an application with those details",
    );
  });
});
