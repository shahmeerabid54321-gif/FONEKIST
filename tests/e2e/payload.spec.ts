import { expect, test } from "@playwright/test";

/**
 * Guards the image ladder, which is the largest single saving on this site and the one
 * nothing else can catch.
 *
 * `components/photo.tsx` names its derivative files by rule rather than from a manifest, so
 * that no lookup table has to be shipped to a browser. The cost of that choice is that
 * nothing at runtime knows whether those files exist. If `scripts/derive-media.mjs` is
 * dropped from the build, or its widths, formats or output directory drift from
 * `lib/media.ts`, every photograph on the site 404s: the types still check, the unit tests
 * still pass, and only a browser actually fetching the URLs finds out.
 */

test.describe("the image ladder", () => {
  test("a catalogue tile downloads a derivative, never the full-size source", async ({ page }) => {
    await page.goto("/phones");

    const tile = page.locator("main img[srcset]").first();
    await expect(tile).toBeVisible();

    // `currentSrc` is the file the browser actually chose, which is the only thing that
    // proves `sizes` and the srcset are doing their work.
    const chosen = await tile.evaluate((img: HTMLImageElement) => img.currentSrc);
    expect(chosen).toMatch(/\/media\/derived\/.+-\d+\.(avif|webp)$/);
    expect(chosen).not.toMatch(/\.jpe?g$/);
  });

  test("every file the ladder names is actually on disk", async ({ page, request }) => {
    await page.goto("/phones");
    await expect(page.locator("main img[srcset]").first()).toBeVisible();

    // One tile's full ladder, both formats: enough to catch a missing width, a wrong
    // extension or a build that never ran sharp.
    const urls = await page
      .locator("main picture")
      .first()
      .evaluate((picture: HTMLElement) =>
        [...picture.querySelectorAll("source")]
          .flatMap((source) => (source.getAttribute("srcset") ?? "").split(","))
          .map((entry) => entry.trim().split(/\s+/)[0] ?? "")
          .filter(Boolean),
      );

    expect(urls.length).toBe(8);
    for (const url of urls) {
      const response = await request.get(url);
      expect(response.status(), `${url} is missing; did derive:media run?`).toBe(200);
      expect(Number(response.headers()["content-length"])).toBeGreaterThan(0);
    }
  });

  test("a derivative is a fraction of the source it replaces", async ({ request }) => {
    const source = await request.get("/media/products/samsung-galaxy-a15/01.jpg");
    const derived = await request.get("/media/derived/products/samsung-galaxy-a15/01-640.avif");

    expect(source.status()).toBe(200);
    expect(derived.status()).toBe(200);

    const sourceBytes = (await source.body()).length;
    const derivedBytes = (await derived.body()).length;

    // Measured at roughly 7% of the source. A tenth is a generous bound that still fails
    // loudly if the ladder ever starts emitting something close to full size.
    expect(derivedBytes).toBeLessThan(sourceBytes / 10);
  });
});
