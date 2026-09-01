import { z } from "zod";

/**
 * Environment configuration, validated once at import time.
 *
 * TRD section 14 separates public config, server config and secrets. Anything reachable
 * from the browser must be prefixed NEXT_PUBLIC_; everything else stays server-only and is
 * read through `serverEnv`, which throws if imported from a client component.
 *
 * Validating at import time is what makes a misconfigured deployment fail on boot rather
 * than on a customer's first request.
 */

const publicSchema = z.object({
  /**
   * Scopes this storefront to the FONEKIST sales channel (ADR-022). It is what makes the
   * catalog phone-only, so a key belonging to the other storefront would silently widen
   * this shop to laptops and headphones. It cannot be validated here beyond its shape;
   * `pnpm test:e2e` asserts the boundary against a running backend.
   */
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: z.string().min(1, "Publishable key is required."),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3001"),
  NEXT_PUBLIC_SUPPORT_PHONE: z.string().default(""),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().default(""),
  NEXT_PUBLIC_WHATSAPP_NUMBER: z.string().default(""),
  NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_PKR: z.coerce.number().int().nonnegative().default(50000),
  /**
   * Origin that serves catalog media. The shared backend stores root-relative paths that
   * resolve on the other storefront's origin, not this one; see `lib/media.ts`. Empty means
   * media is served from this origin.
   */
  NEXT_PUBLIC_MEDIA_BASE_URL: z.string().default(""),
  /**
   * Stated on the policy pages and the return form. Commerce holds the authoritative value
   * and enforces it (`RETURN_WINDOW_DAYS` there); this is the number the storefront prints.
   * Two values that must agree is a real risk, accepted because policy pages are statically
   * generated and cannot ask commerce at build time, so both are set from the same
   * deployment configuration and enforcement never reads this one.
   */
  NEXT_PUBLIC_RETURN_WINDOW_DAYS: z.coerce.number().int().positive().default(7),

  /**
   * Feature gates (ADR-023). Off by default: installments must not ship before the
   * security tests, the admin review acceptance pass and the legal review all clear, and a
   * flag that defaults on would ship it by omission.
   */
  NEXT_PUBLIC_FEATURE_COMPARISON: z.string().default("false"),
  NEXT_PUBLIC_FEATURE_INSTALLMENTS: z.string().default("false"),
});

// Next inlines process.env.NEXT_PUBLIC_* at build time only for literal property access,
// so each one is listed explicitly rather than spreading process.env.
export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPPORT_PHONE: process.env.NEXT_PUBLIC_SUPPORT_PHONE,
  NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
  NEXT_PUBLIC_WHATSAPP_NUMBER: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_PKR: process.env.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_PKR,
  NEXT_PUBLIC_MEDIA_BASE_URL: process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
  NEXT_PUBLIC_RETURN_WINDOW_DAYS: process.env.NEXT_PUBLIC_RETURN_WINDOW_DAYS,
  NEXT_PUBLIC_FEATURE_COMPARISON: process.env.NEXT_PUBLIC_FEATURE_COMPARISON,
  NEXT_PUBLIC_FEATURE_INSTALLMENTS: process.env.NEXT_PUBLIC_FEATURE_INSTALLMENTS,
});

const serverSchema = z.object({
  MEDUSA_BACKEND_URL: z.string().url().default("http://localhost:9000"),
});

type ServerEnv = z.infer<typeof serverSchema>;

/**
 * The server-only environment.
 *
 * The guard fires when a value is READ, not when this module is imported.
 *
 * It used to be an IIFE evaluated at module scope, which threw as soon as `env.ts` was
 * pulled into a browser bundle at all. That caught the case it was meant to catch, and also
 * a case it was not: a client component reaching `publicEnv` through an ordinary chain, such
 * as `monthly-explorer` to `product-card` to `media`, which only ever wanted the public
 * values. The throw happened during hydration, so React tore down and re-rendered the whole
 * tree and the page fell to its error boundary.
 *
 * A proxy keeps the rule exactly as CLAUDE.md states it, `serverEnv` must never reach client
 * code and throws if it does, while letting `publicEnv` be imported from anywhere, which is
 * the entire point of it being public.
 */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, key: string) {
    if (typeof window !== "undefined") {
      throw new Error("serverEnv was imported into client code. Use publicEnv instead.");
    }
    // Parsed on first read rather than at import, so a missing variable still fails loudly
    // and does so on the server where the message is useful.
    const parsed = serverSchema.parse({ MEDUSA_BACKEND_URL: process.env.MEDUSA_BACKEND_URL });
    return parsed[key as keyof ServerEnv];
  },
});
