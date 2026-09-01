#!/usr/bin/env node
/**
 * Vendors the part of `@pk/contracts` that FONEKIST depends on.
 *
 * FONEKIST is a separate repository (ADR-022), so it cannot depend on the monorepo's
 * `workspace:*` packages. The alternative to vendoring is retyping the shared rules, which
 * is how two systems that must agree quietly stop agreeing. Vendoring keeps one author for
 * these rules and makes divergence detectable: `manifest.json` records the hash of each
 * upstream file, and `drift.test.ts` fails when upstream moves.
 *
 * The copy is scoped deliberately. These files are stable, dependency-free apart from zod,
 * and describe things both systems must agree on: how a Pakistani address and phone number
 * are shaped, what the error codes mean, which operations require an idempotency key, and
 * which state transitions are legal. Everything else is reached over HTTP, where the API
 * response is the contract.
 *
 * `@pk/ui` is deliberately NOT vendored: its components encode ADR-021, a visual system
 * FONEKIST does not share.
 *
 * Usage:  pnpm sync:contracts  [--check]
 *   --check  report drift and exit non-zero without writing (used by CI and the test)
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DEST = join(ROOT, "src", "lib", "pk");

/** Overridable so a checkout in a different place, or CI, can still run this. */
const SOURCE =
  process.env.PK_CONTRACTS_SRC ??
  resolve(ROOT, "..", "WEBSITE DESIGN", "packages", "contracts", "src");

/** The closed list of vendored files. Adding a dependency on upstream means adding it here. */
const FILES = [
  "errors/codes.ts",
  "errors/app-error.ts",
  "errors/index.ts",
  "envelope/envelope.ts",
  "envelope/idempotency.ts",
  "envelope/index.ts",
  "states/payment.ts",
  "states/cod.ts",
  "states/courier.ts",
  "states/tracking.ts",
  "states/installment.ts",
  "states/index.ts",
  "schemas/pakistan.ts",
  "schemas/catalog.ts",
  "schemas/brands.ts",
  "schemas/installments.ts",
  "schemas/api.ts",
  "schemas/index.ts",
  // Only the search provider contract, not the whole `providers/` barrel: the courier and
  // payment provider interfaces describe things this storefront never implements, and
  // vendoring them would mean tracking drift in contracts we do not use.
  "providers/search-provider.ts",
];

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/**
 * Upstream is published as ESM and writes `./codes.js` for what is on disk as `codes.ts`.
 * TypeScript resolves that, but the rewrite removes any doubt about how this repo's
 * bundler treats it, and it is the only edit made to vendored source.
 */
const rewriteSpecifiers = (source) =>
  source.replace(/(from\s+")(\.[^"]*?)\.js(")/g, "$1$2$3");

const BANNER = (relativePath) =>
  `/*\n * GENERATED FILE. Do not edit.\n *\n * Vendored from @pk/contracts \`src/${relativePath}\` by \`pnpm sync:contracts\`.\n * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.\n */\n\n`;

const checkOnly = process.argv.includes("--check");

if (!existsSync(SOURCE)) {
  console.error(
    `Upstream contracts not found at:\n  ${SOURCE}\n\n` +
      `Set PK_CONTRACTS_SRC to the \`packages/contracts/src\` directory of the ` +
      `WEBSITE DESIGN monorepo, or check out that repository alongside this one.`,
  );
  process.exit(2);
}

const manifest = {};
const drifted = [];

for (const relativePath of FILES) {
  const upstream = readFileSync(join(SOURCE, relativePath), "utf8");
  const hash = sha256(upstream);
  manifest[relativePath] = hash;

  const destination = join(DEST, relativePath);

  if (checkOnly) {
    if (!existsSync(destination)) {
      drifted.push(`${relativePath}: not vendored yet`);
    }
    continue;
  }

  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, BANNER(relativePath) + rewriteSpecifiers(upstream), "utf8");
}

const manifestPath = join(DEST, "manifest.json");

if (checkOnly) {
  const recorded = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8")).files
    : {};
  for (const [relativePath, hash] of Object.entries(manifest)) {
    if (recorded[relativePath] !== hash) {
      drifted.push(`${relativePath}: upstream changed since the last sync`);
    }
  }
  if (drifted.length > 0) {
    console.error("Vendored contracts are out of date:\n  " + drifted.join("\n  "));
    console.error("\nRun `pnpm sync:contracts` and review the diff.");
    process.exit(1);
  }
  console.log(`Vendored contracts are current (${FILES.length} files).`);
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });
writeFileSync(
  manifestPath,
  JSON.stringify({ source: "@pk/contracts", files: manifest }, null, 2) + "\n",
  "utf8",
);

console.log(`Vendored ${FILES.length} file(s) from ${SOURCE}`);
