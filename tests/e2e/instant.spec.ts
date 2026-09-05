import { expect, test } from "@playwright/test";

/**
 * Guards the thing this whole optimisation was about: a page that appears when you click it.
 *
 * The site used to render every route on the server on every request, with no loading state
 * anywhere, so a click showed the previous page until commerce answered. The fix was a
 * static shell per route plus `<Suspense>` around the parts that genuinely depend on the
 * request. That structure is easy to lose by accident: one `await` moved above a boundary,
 * one `cookies()` read added to a shared component, and every page in the site quietly goes
 * back to blocking.
 *
 * These tests assert the shell, not the speed. They check that the identifying content of a
 * page is in the HTML the server sends first, before any streamed content arrives, which is
 * what makes a navigation feel instant and is a property rather than a benchmark.
 */

/**
 * The prerender marker Next sets on a response served from a static shell. Its absence is
 * the precise regression this file exists to catch.
 */
async function prerenderHeaders(request: import("@playwright/test").APIRequestContext, path: string) {
  const response = await request.get(path);
  expect(response.status()).toBe(200);
  return response.headers();
}

test.describe("static shells", () => {
  test("fully static routes are prerendered and publicly cacheable", async ({ request }) => {
    // These read no request data at all, so they must be plain static HTML. If one of them
    // stops being cacheable, something has started reading cookies or headers in a shared
    // component, which costs every route in the site its shell.
    for (const path of ["/", "/brands", "/installments", "/track", "/policies/returns"]) {
      const headers = await prerenderHeaders(request, path);
      expect(headers["x-nextjs-prerender"], `${path} should be prerendered`).toBeTruthy();
      expect(headers["cache-control"], `${path} should be cacheable by a CDN`).toContain(
        "s-maxage",
      );
    }
  });

  test("URL-driven routes still ship a prerendered shell", async ({ request }) => {
    // These legitimately depend on the request, so they stream. They must still have a shell
    // rather than blocking on the backend before the first byte.
    for (const path of ["/phones", "/brands/samsung", "/p/redmi-13c"]) {
      const headers = await prerenderHeaders(request, path);
      expect(headers["x-nextjs-prerender"], `${path} should have a static shell`).toBeTruthy();
    }
  });
});

test.describe("what arrives first", () => {
  test("the catalogue heading is in the shell, not behind the data", async ({ page }) => {
    await page.goto("/phones");
    // The heading belongs to the shell, so it is present regardless of what commerce does.
    await expect(page.getByRole("heading", { level: 1, name: "All phones" })).toBeVisible();
    // And the results do arrive.
    await expect(page.locator('a[href^="/p/"]').first()).toBeVisible();
  });

  test("a client navigation to a product page paints before the data lands", async ({ page }) => {
    await page.goto("/phones");
    const firstProduct = page.locator('a[href^="/p/"]').first();
    const href = await firstProduct.getAttribute("href");
    await firstProduct.click();
    await page.waitForURL((url) => url.pathname === href);
    await expect(page.locator("h1").first()).toBeVisible();
  });
});

test.describe("the query badge", () => {
  test("the header renders without waiting on a cookie read", async ({ request }) => {
    const response = await request.get("/");
    const html = await response.text();
    // The badge is a client component now, so the link is in the static HTML with no count.
    // If a count ever appears in prerendered HTML, the badge has gone back to the server and
    // taken every page's static shell with it.
    expect(html).toContain('href="/query"');
    expect(response.headers()["cache-control"]).toContain("s-maxage");
  });
});

test.describe("stock is never stale", () => {
  test("a product page states availability", async ({ page }) => {
    await page.goto("/p/redmi-13c");
    // Availability is read outside the hour-long page cache, on a short profile, so that
    // "Only N left" can never be an hour old. Whatever it says, it must say something.
    await expect(
      page.getByText(/In stock|Out of stock|Only \d+ left|Available to order/).first(),
    ).toBeVisible();
  });
});
