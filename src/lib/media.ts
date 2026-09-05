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

/**
 * The width ladder, which must agree with `scripts/derive-media.mjs`.
 *
 * Named here rather than looked up, because this module is imported by client components and
 * a manifest of every photograph would be shipped to every browser to answer a question that
 * a rule answers for free. The build guarantees the rule: `derive-media.mjs` emits all four
 * widths in both formats for every JPG under `public/media`, and it is a hard build step, so
 * a missing file is a broken build rather than a broken tile.
 */
const DERIVED_WIDTHS = [320, 640, 960, 1280] as const;

export interface MediaSources {
  /** The original file. Always present, and what a browser with neither modern format gets. */
  src: string;
  /** `srcset` for AVIF, or null when this source has no ladder (an SVG, or a remote URL). */
  avif: string | null;
  /** `srcset` for WebP. Null under the same conditions as `avif`. */
  webp: string | null;
}

/**
 * Resolves one catalogue path into the sources a `<picture>` needs.
 *
 * **Why the derivative paths are derived rather than recorded.** The alternative is a
 * manifest mapping every source to its derivatives, and this module runs in the browser: that
 * manifest would be a few kilobytes of JSON on every page to describe images the page mostly
 * does not use. A rule costs nothing and cannot drift, as long as the build honours it.
 *
 * The match is on `/media/<something>.jpg` wherever it appears in the resolved URL, so it
 * holds equally for a local path and for the same file behind the CDN
 * (`NEXT_PUBLIC_MEDIA_BASE_URL`, ADR-012): the derivatives sit beside the originals and move
 * with them.
 *
 * Anything else, an SVG placeholder or a remote URL from another origin, returns its `src`
 * and no srcsets. SVG is vector and already smaller than any derivative; a remote URL is not
 * ours to have processed.
 */
export function mediaSources(path: string | null | undefined): MediaSources | null {
  const src = mediaUrl(path);
  if (!src) return null;

  // `mediaUrl` is idempotent, so a caller that already resolved the path is not punished for
  // passing the result in.
  const marker = src.indexOf("/media/");
  const isPhoto = /\.jpe?g$/i.test(src);
  if (marker === -1 || !isPhoto) return { src, avif: null, webp: null };

  const prefix = src.slice(0, marker);
  const stem = src.slice(marker + "/media/".length).replace(/\.jpe?g$/i, "");

  const ladder = (extension: "avif" | "webp") =>
    DERIVED_WIDTHS.map(
      (width) => `${prefix}/media/derived/${stem}-${width}.${extension} ${width}w`,
    ).join(", ");

  return { src, avif: ladder("avif"), webp: ladder("webp") };
}
