import { revalidateTag } from "next/cache";
import { log } from "@/lib/log";

/**
 * Expires cached catalogue data on demand.
 *
 * **Why this has to exist.** The read layer is cached for an hour (`lib/catalog.ts`,
 * `lib/search.ts`), which is what makes the storefront cheap enough to serve at scale. The
 * cost of that is an hour in which a corrected price, a product taken off sale or a newly
 * stocked handset is invisible. For browsing that is fine and ADR-014 already allows it. For
 * a merchant who has just fixed a mistake it is not: "wait an hour" is not an answer, and
 * without this route the only remedy would be a redeploy.
 *
 * Every cached read in `src/lib` already carries a `cacheTag`. Until this route existed
 * those tags were decorative, because nothing ever called `revalidateTag`.
 *
 * **Authentication.** A shared secret in a header, compared in constant time. This endpoint
 * cannot read or change any data, but it can be used to force cache misses, so an
 * unauthenticated one is a way to make the backend do all the work the cache exists to
 * avoid. It fails closed: with no secret configured it refuses every request rather than
 * accepting every request, which is the same way document scanning fails in ADR-024.
 */

/** Tags a caller may expire. An open list would let one request invalidate everything. */
const KNOWN_TAGS = new Set(["search", "categories", "regions"]);

/** Prefixed tags, expired as `product:<handle>` and so on. */
const KNOWN_PREFIXES = ["product:", "product-extras:", "plans:", "brand:", "stock:"];

function isKnownTag(tag: string): boolean {
  if (KNOWN_TAGS.has(tag)) return true;
  return KNOWN_PREFIXES.some((prefix) => tag.startsWith(prefix) && tag.length > prefix.length);
}

/**
 * Compares without leaking where the two differ.
 *
 * A plain `===` on a secret returns as soon as it finds a mismatched byte, and the timing
 * difference is measurable often enough to be worth not offering.
 */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < provided.length; i += 1) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.REVALIDATE_SECRET ?? "";

  // No secret configured means this deployment has not opted in. Refusing is the safe
  // default; accepting would make the endpoint public.
  if (expected.length === 0) {
    return Response.json(
      { error: "Revalidation is not configured." },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-revalidate-secret") ?? "";
  if (!secretMatches(provided, expected)) {
    return Response.json({ error: "Not authorised." }, { status: 401 });
  }

  let body: { tags?: unknown };
  try {
    body = (await request.json()) as { tags?: unknown };
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const requested = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [];
  if (requested.length === 0) {
    return Response.json(
      { error: 'Expected { "tags": ["search", "product:redmi-13c"] }.' },
      { status: 400 },
    );
  }

  const accepted = requested.filter(isKnownTag);
  const rejected = requested.filter((tag) => !isKnownTag(tag));

  for (const tag of accepted) {
    // 'max' gives stale-while-revalidate: the next request is served the old value
    // immediately while the new one is fetched behind it, so expiring a busy tag does not
    // hand a burst of traffic straight to the backend.
    revalidateTag(tag, "max");
  }

  log.info("cache revalidated", {
    operation: "cache.revalidate",
    accepted: accepted.length,
    rejected: rejected.length,
  });

  return Response.json({ revalidated: accepted, ignored: rejected });
}
