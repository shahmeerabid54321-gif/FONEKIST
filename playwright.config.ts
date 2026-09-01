import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * Runs against a real storefront and a real commerce backend: the point of these tests is
 * to prove the catalog boundary and the purchase path work against the actual order
 * lifecycle, not against mocks. In particular INST-001 (phones only) is only meaningful
 * against a real sales channel.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Serial: the tests run against shared seeded inventory.
  workers: 1,
  reporter: process.env.CI ? [["html"], ["list"]] : "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Mobile is primary, not a collapsed desktop (UX spec section 1), so it is a first
    // class target rather than an afterthought.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3001",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
