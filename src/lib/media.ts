import { publicEnv } from "./env";

/**
 * Resolves a catalog media path to a URL this storefront can actually load.
 *
 * The shared backend stores root-relative paths like `/media/products/x/01.jpg`. Those
 * originate in the Voltmark storefront's `public/`, because that is where `media:photos`
 * writes them. FONEKIST now keeps its own copy, synced by `pnpm sync:media`, so those paths
 * resolve against this origin and this storefront does not depend on another shop's server
 * being up to show a photograph.
 *
 * `NEXT_PUBLIC_MEDIA_BASE_URL` remains the seam, and is empty locally. In production it
 * points at the CDN, which is where ADR-012 says media belongs. Left empty, paths resolve
 * against this origin unchanged, which is the case that now covers local development.
 *
 * Absolute URLs are returned untouched: once media moves to object storage the backend will
 * store absolute URLs and this becomes a no-op.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;

  const trimmed = path.trim();
  if (trimmed.length === 0) return null;

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) return trimmed;

  const base = publicEnv.NEXT_PUBLIC_MEDIA_BASE_URL;
  if (!base) return trimmed;

  // Exactly one slash at the join, whatever the two sides look like.
  return `${base.replace(/\/+$/, "")}/${trimmed.replace(/^\/+/, "")}`;
}
