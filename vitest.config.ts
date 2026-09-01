import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Playwright owns tests/e2e and uses its own runner; Vitest must not try to collect it.
    include: ["src/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    environment: "node",
    // `lib/env.ts` validates configuration at import time, which is what makes a
    // misconfigured deployment fail fast rather than at the first request. Unit tests
    // therefore need a valid-looking configuration to import anything downstream of it.
    env: {
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_test_unit",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3001",
      MEDUSA_BACKEND_URL: "http://localhost:9000",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
