/**
 * Copies catalogue media into this repo's `public/`, so FONEKIST serves its own imagery.
 *
 * The backend stores root-relative paths like `/media/products/x/01.jpg`. Those used to
 * resolve only against the Voltmark storefront, which is where `media:photos` writes them,
 * so FONEKIST pointed `NEXT_PUBLIC_MEDIA_BASE_URL` at that origin and loaded its pictures
 * from another shop. That is a development crutch, not an architecture: two storefronts on
 * one machine happen to be running, and in production only one of them would be.
 *
 * Now every path resolves against this origin. `NEXT_PUBLIC_MEDIA_BASE_URL` stays in the
 * code as the seam for the CDN (ADR-012), and is empty locally.
 *
 * These are development stand-ins and a launch blocker. `media-manifest.json` records what
 * each file is and where it came from.
 */
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const source =
  process.env.MEDIA_SOURCE_DIR ??
  path.resolve(process.cwd(), "../WEBSITE DESIGN/apps/storefront/public/media");
const destination = path.resolve(process.cwd(), "public/media");

try {
  await stat(source);
} catch {
  // The sibling repo is not a deployment requirement, so this is a skip, not a failure.
  console.log(`sync:media skipped, no media at ${source}`);
  process.exit(0);
}

await rm(destination, { recursive: true, force: true });
await mkdir(path.dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`sync:media copied ${source} to ${destination}`);
