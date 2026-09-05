import { mediaSources } from "@/lib/media";

/**
 * A catalogue photograph, at the size the browser actually needs.
 *
 * **Why this is not `next/image`.** `next.config.ts` sets `images.unoptimized`, for a reason
 * that still holds: transforming twenty-four catalogue tiles on demand is a twenty-four
 * request CPU spike, and on the instance this runs on that is the storefront timing out. But
 * `unoptimized` also switches off everything that made `next/image` worth having. `sizes`
 * became decoration, `formats: ["image/avif", "image/webp"]` never applied, and a phone drew
 * a 180px tile by downloading the 1200px, 209 KB JPG behind it, twenty-four times on one
 * catalogue page.
 *
 * Both halves of that were answers to the same false question. The photographs are committed
 * files that change when somebody replaces them, so the resizing is a build-time job, not a
 * request-time one: `scripts/derive-media.mjs` emits four widths in AVIF and WebP, and this
 * component points at them. Nothing is transformed per request, `/_next/image` is never
 * touched, and a tile costs about 4 KB instead of 124 KB.
 *
 * **Why `<picture>` rather than a custom `images.loader`.** A loader returns one URL, so it
 * can offer one format. AVIF is meaningfully smaller than WebP on this material at every
 * width, and it is not universal, and a `<source>` a browser cannot decode is a broken image
 * rather than a fallback: `<picture>` chooses on the declared type and does not retry on a
 * failed load. Offering both and letting the browser declare what it can read is what the
 * element is for.
 *
 * An SVG placeholder or a remote URL has no ladder. Those render as a plain `<img>`, which is
 * what they should be: the placeholders are vector and already smaller than any derivative.
 */
type PhotoProps = {
  /**
   * A catalogue path, resolved or not. `mediaUrl` is idempotent, so a caller that already
   * resolved it through `mediaUrl` and one that passes the raw backend path both work.
   */
  src: string | null | undefined;
  alt: string;
  /** The `sizes` attribute, and it is load-bearing: without it a browser assumes 100vw and
   * picks the widest entry in the ladder for a thumbnail. */
  sizes?: string;
  className?: string;
  /**
   * Above the fold. Loads eagerly at high priority instead of lazily, which is the whole of
   * what `priority` meant on `next/image` for images that were never being optimised.
   */
  priority?: boolean;
  "aria-hidden"?: boolean | "true" | "false";
} & (
  | {
      /** Fills a positioned ancestor, which supplies the aspect ratio and so the CLS guard. */
      fill: true;
      width?: never;
      height?: never;
    }
  | { fill?: false; width: number; height: number }
);

export function Photo({
  src,
  alt,
  sizes,
  className = "",
  priority = false,
  fill,
  width,
  height,
  "aria-hidden": ariaHidden,
}: PhotoProps) {
  const sources = mediaSources(src);
  if (!sources) return null;

  /*
   * A `srcset` with width descriptors and no `sizes` is not "no hint", it is a hint of
   * 100vw: the browser assumes the image fills the viewport and picks the widest entry in
   * the ladder. That is how a 64px order thumbnail ends up downloading the 1280px file. A
   * fixed-size image knows its own width, so it says so.
   */
  const resolvedSizes = sizes ?? (fill ? undefined : `${width}px`);

  const img = (
    /*
     * The lint rule here says to use `next/image` or a custom loader "to automatically
     * optimize images", and this file is the considered answer to it: the optimisation
     * happens in `scripts/derive-media.mjs` at build time, and the srcsets below are what
     * make it reach a browser. Routing through `next/image` would either put a transform
     * back on the request path or, with `unoptimized`, throw the ladder away again.
     */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sources.src}
      srcSet={sources.webp ?? undefined}
      sizes={sources.webp ? resolvedSizes : undefined}
      alt={alt}
      aria-hidden={ariaHidden}
      // `fill` is `next/image`'s geometry reproduced: the parent is `relative` and carries
      // the aspect ratio, so the picture cannot shift the page as it loads.
      {...(fill ? {} : { width, height })}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={fill ? `absolute inset-0 h-full w-full ${className}` : className}
    />
  );

  // No ladder, so no `<picture>` to wrap it in: an extra element that offers no alternative
  // source is just an extra element.
  if (!sources.avif) return img;

  return (
    /*
     * `display: contents` so the picture element itself has no box. Under `fill` the image is
     * absolutely positioned and has to resolve against the caller's `relative` container; a
     * `<picture>` with a box of its own would become that container and collapse the image to
     * nothing.
     */
    <picture style={{ display: "contents" }}>
      <source type="image/avif" srcSet={sources.avif} sizes={resolvedSizes} />
      <source type="image/webp" srcSet={sources.webp ?? undefined} sizes={resolvedSizes} />
      {img}
    </picture>
  );
}
