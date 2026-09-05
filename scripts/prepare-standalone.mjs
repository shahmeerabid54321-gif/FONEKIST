#!/usr/bin/env node
/**
 * Completes the standalone build.
 *
 * `output: "standalone"` emits a server and the minimum `node_modules` it needs, but
 * deliberately does not copy `.next/static` or `public`: on a real deployment those are
 * usually served by a CDN rather than by Node, so Next leaves the choice open. Running the
 * standalone server without them gives a site with no CSS, no JavaScript and no photographs,
 * which looks like a catastrophic bug and is really a missing copy step.
 *
 * Run automatically after `pnpm build`.
 */

import { cp, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

try {
  await access(standalone);
} catch {
  // Not a standalone build. Nothing to do, and not an error: `next build` without the
  // `output` option is a perfectly good build.
  process.exit(0);
}

await cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});
await cp(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });

console.log("standalone: copied .next/static and public");
