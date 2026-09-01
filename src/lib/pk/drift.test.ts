import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");

const UPSTREAM =
  process.env.PK_CONTRACTS_SRC ??
  resolve(ROOT, "..", "WEBSITE DESIGN", "packages", "contracts", "src");

/**
 * FONEKIST vendors part of `@pk/contracts` because it lives in its own repository and
 * cannot use `workspace:*` (ADR-022). Vendoring only works if divergence is loud, so this
 * is the thing that makes it loud.
 *
 * It skips rather than fails when the monorepo is not checked out beside this one: CI and
 * deploys build from the vendored copy and must not require a sibling checkout. That means
 * this test protects a developer's working copy, not the build, which is the right place
 * for it: drift is introduced by a person editing upstream, and this is what tells them.
 */
describe("vendored @pk/contracts", () => {
  const available = existsSync(UPSTREAM);

  it.runIf(available)("matches upstream", () => {
    expect(() =>
      execFileSync("node", [join(ROOT, "scripts", "sync-contracts.mjs"), "--check"], {
        cwd: ROOT,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it.skipIf(available)("is skipped when the monorepo is not checked out alongside", () => {
    expect(available).toBe(false);
  });

  it("records a hash for every vendored file", () => {
    const manifest = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8")) as {
      files: Record<string, string>;
    };

    const entries = Object.entries(manifest.files);
    expect(entries.length).toBeGreaterThan(0);

    for (const [relativePath, hash] of entries) {
      expect(hash, relativePath).toMatch(/^[0-9a-f]{64}$/);
      expect(existsSync(join(HERE, relativePath)), relativePath).toBe(true);
    }
  });
});
