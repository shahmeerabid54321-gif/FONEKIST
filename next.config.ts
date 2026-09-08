import type { NextConfig } from "next";

/**
 * The exact hosts next/image may fetch from.
 *
 * A wildcard hostname here turns the image endpoint into an open proxy: anyone can pass any
 * URL and have this server fetch and re-serve it, spending our bandwidth and reaching
 * whatever the server can reach. So both entries are single, explicitly configured origins.
 *
 * `NEXT_PUBLIC_MEDIA_HOST` is the CDN (ADR-012), HTTPS only.
 * `NEXT_PUBLIC_MEDIA_BASE_URL` is the origin actually serving catalog media, which in local
 * development is the other storefront on plain HTTP; see `src/lib/media.ts` for why that
 * seam exists. Parsed rather than pattern-matched so a malformed value fails loudly at
 * config load instead of silently allowing nothing.
 */
function buildRemotePatterns() {
  const patterns: { protocol: "http" | "https"; hostname: string; port?: string }[] = [];

  if (process.env.NEXT_PUBLIC_MEDIA_HOST) {
    patterns.push({ protocol: "https", hostname: process.env.NEXT_PUBLIC_MEDIA_HOST });
  }

  const base = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  if (base) {
    const url = new URL(base);
    patterns.push({
      protocol: url.protocol === "http:" ? "http" : "https",
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
    });
  }

  return patterns;
}

const config: NextConfig = {
  reactStrictMode: true,

  typedRoutes: true,

  /*
   * Partial Prerendering, which is the difference between a shop and a slideshow.
   *
   * Before this flag, every one of the fourteen routes rendered on every request. Not one
   * content page was prerendered: `.next/prerender-manifest.json` listed the icons, the web
   * manifest and nothing else, `dynamicRoutes` was empty, and `revalidate = 60` on the home
   * page and `generateStaticParams` on the policies produced no HTML at all. The cause was a
   * single `cookies()` read for the header's query count, which without PPR opts the entire
   * route tree into dynamic rendering no matter how carefully it is wrapped.
   *
   * `site-header.tsx` already says the Suspense boundary around that count is what keeps the
   * cookie from making every page dynamic. That was true of the intent and false of the
   * build. This flag is what makes the comment correct: a `<Suspense>` boundary now marks a
   * dynamic hole in an otherwise static shell, so the cookie costs us the badge and nothing
   * else.
   *
   * `partialPrefetching` is the other half. Each visible link prefetches the destination's
   * shell, so by the time a customer clicks, the page they are going to is already in the
   * browser. Nothing is cached implicitly under this model; `use cache` in `lib/` is where
   * every caching decision now lives.
   */
  cacheComponents: true,
  partialPrefetching: true,

  /*
   * A self-contained server directory, which is what `scripts/serve.mjs` runs across every
   * core (see below) and what a container should copy rather than shipping `node_modules`.
   */
  output: "standalone",

  /*
   * Static generation, sized for the machine that actually runs it.
   *
   * Next sizes its prerender pool from the reported core count, which on Render's free
   * instance meant 25 worker processes fighting over 0.1 of a CPU. One worker builds them in
   * sequence instead: slower on a big machine, and the only thing that finishes on a small
   * one.
   *
   * This matters more now than it did when it was written, because this is the first build
   * that actually prerenders anything. `generateStaticParams` on the product and brand pages
   * is deliberately capped at a small slice for the same reason: the paths it does not name
   * still work, they stream instead.
   *
   * The longer budget is for the backend rather than the CPU. A free-tier backend that is
   * cold or mid-redeploy can spend the full client timeout before a page gives up on it.
   *
   * `useCacheTimeout` is how long a `use cache` fill may stall before Next kills it, and it
   * is pinned here because the default is derived from the line below it: ninety per cent of
   * `staticPageGenerationTimeout`. That coupling is invisible and it bites. Raising the page
   * budget to 180s for the backend's sake silently raised the fill budget to 162s, so a
   * single stalled catalogue read sat there for most of three minutes before failing the
   * build, and the code asserting a "hard, unconfigurable fifty seconds" was guarding a
   * number this project had never had.
   *
   * 60s is chosen against `CACHE_READ_DEADLINE_MS` in `lib/cached-read.ts`, not against the
   * page budget. That deadline (45s) is the one that should fire, because it records the
   * failure inside the scope and lets the page degrade; this is the backstop behind it, far
   * enough back that the deadline always wins and near enough that a fill which somehow
   * outlives both still fails while the page budget can still report it.
   */
  experimental: { cpus: 1, useCacheTimeout: 60 },
  staticPageGenerationTimeout: 180,

  /*
   * How long a fully static page may be served from a shared cache.
   *
   * Only reachable now that the header stopped reading a cookie on the server: while it did,
   * every document in the site was `private, no-store` and no CDN could hold any of it. The
   * static routes carry `s-maxage=3600, stale-while-revalidate` instead, which is the single
   * cheapest capacity increase available to this project, because a CDN then answers most
   * traffic without the origin being involved at all.
   */
  expireTime: 3600,

  // FONEKIST documents its own conventions in CLAUDE.md; Next's generated agent files
  // would duplicate and contradict them.
  agentRules: false,

  /*
   * The image endpoint, which this storefront no longer uses.
   *
   * `unoptimized` was the right call for the wrong question. On-demand transformation of
   * twenty-four catalogue tiles is a twenty-four request CPU spike, and on a 0.1-CPU
   * instance that is the whole storefront timing out, so turning it off was correct. What it
   * also did was make `sizes` decoration and `formats` inert, and leave a phone downloading
   * the 1200px, 124 KB average source to draw a 180px tile.
   *
   * Both of those are answers to "how do we resize at request time?", and the photographs
   * are committed files: the question is a build-time one. `scripts/derive-media.mjs` emits
   * an AVIF and WebP ladder at four widths, `components/photo.tsx` serves it through
   * `<picture>`, and `/_next/image` is now on no path at all. A catalogue tile costs about
   * 4 KB rather than 124 KB and the server does no image work whatsoever.
   *
   * The block stays, at its safe settings, because it is what would govern a future
   * `next/image` if one were added. `remotePatterns` remains a single explicitly configured
   * origin rather than a wildcard, which would make the endpoint an open proxy; the SVG
   * settings remain the ones that make our generated placeholders safe to serve. Nothing
   * here is currently reachable.
   */
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
    remotePatterns: buildRemotePatterns(),
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  /*
   * The cash rail is gone, and its URLs are in the wild.
   *
   * `/cart` and `/checkout` were live routes on the deployed site, so they are in browser
   * histories, bookmarks and whatever search engines have indexed. A 404 for them would
   * read as a broken shop rather than a changed one, so both land on the query, which is
   * the nearest thing the site still has to "the phones I picked".
   */
  async redirects() {
    return [
      { source: "/cart", destination: "/query", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // TRD section 10 security baseline.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default config;
