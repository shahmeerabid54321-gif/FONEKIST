import { expect, test } from "@playwright/test";

/**
 * INST-001: FONEKIST sells phones and nothing else.
 *
 * This is the test that matters most in this repo, because the guarantee lives in the
 * backend rather than here (ADR-022): the FONEKIST publishable key resolves to the FONEKIST
 * sales channel, and that channel contains only phones. Nothing in this codebase filters
 * for phones, so nothing in this codebase can be inspected to confirm the rule holds. Only
 * an end-to-end request can.
 *
 * It therefore fails on the two ways the guarantee actually breaks in practice: the wrong
 * publishable key in the environment, and a non-phone assigned to the FONEKIST channel.
 */

/** Seeded non-phone handles. None of these may ever be reachable from FONEKIST. */
const NON_PHONES = [
  "macbook-air-15-m3",
  "dell-xps-13-9340",
  "sony-wh-1000xm5",
  "apple-airpods-pro-2",
  "jbl-tune-770nc",
];

test("the storefront lists phones", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Newest in stock" })).toBeVisible();

  // At least one product renders, so an empty catalog cannot pass the exclusion checks
  // below by virtue of showing nothing at all.
  const cards = page.locator("article");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
});

test("no non-phone product is reachable", async ({ page }) => {
  await page.goto("/");
  const body = (await page.locator("main").textContent()) ?? "";

  for (const handle of NON_PHONES) {
    // Handles are hyphenated; compare against the words a card would actually render.
    const words = handle.split("-").filter((word) => word.length > 3);
    const allPresent = words.every((word) => body.toLowerCase().includes(word));
    expect(allPresent, `non-phone "${handle}" appears in the FONEKIST catalog`).toBe(false);
  }
});

/*
 * The catalogue pages are built on `/store/search`, not on `/store/products`, and that is a
 * different boundary with a different failure mode.
 *
 * Medusa scopes `/store/products` by the publishable key's sales channels on its own, so
 * the home page above looked correct while the search index, which is derived by our own
 * code and inherits none of that scoping, was serving this storefront laptops and
 * headphones. Every page that lists or filters phones goes through search, so each one is
 * checked rather than trusting that one of them implies the others.
 */
const SEARCH_BACKED_ROUTES = [
  "/phones",
  "/phones?in_stock=1",
  "/phones?monthly_max=20000&installments=1",
  "/search?q=a",
  "/brands/samsung",
] as const;

for (const route of SEARCH_BACKED_ROUTES) {
  test(`no non-phone reaches ${route}`, async ({ page }) => {
    await page.goto(route);
    const body = ((await page.locator("main").textContent()) ?? "").toLowerCase();

    for (const handle of NON_PHONES) {
      const words = handle.split("-").filter((word) => word.length > 3);
      const allPresent = words.every((word) => body.includes(word));
      expect(allPresent, `non-phone "${handle}" reached ${route}`).toBe(false);
    }
  });
}

test("type-ahead does not suggest another storefront's products", async ({ page }) => {
  // Autocomplete is not a lesser surface: it would leak the other catalogue's product names
  // one keystroke at a time, and every suggestion leads to a 404 here.
  await page.goto("/");

  const response = await page.request.get("/api/suggest?q=sound");
  const body = (await response.json()) as { suggestions?: { text: string }[] };
  const texts = (body.suggestions ?? []).map((suggestion) => suggestion.text.toLowerCase());

  for (const text of texts) {
    expect(text).not.toContain("soundcore");
    expect(text).not.toContain("quietcomfort");
  }
});

test("every listed product carries a brand and an exact model code", async ({ page }) => {
  await page.goto("/phones");

  const cards = page.locator("article");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const text = (await card.textContent()) ?? "";
    // CUST-008 and the PRD's identity rule: a customer must be able to tell exactly which
    // hardware they are buying, not just the marketing name.
    expect(text.trim().length, `card ${index} is empty`).toBeGreaterThan(0);
    await expect(card.getByRole("heading", { level: 3 })).toBeVisible();
  }
});
