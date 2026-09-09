interface RevalidationLogger {
  warn(message: string): void;
}

interface RevalidationEnvironment {
  STOREFRONT_REVALIDATE_URL?: string;
  STOREFRONT_REVALIDATE_SECRET?: string;
}

/**
 * Expires this storefront's Next cache after an owner changes catalogue content.
 *
 * The bridge is deliberately optional for local development and fails without blocking the
 * underlying admin save. A catalogue edit is authoritative in commerce even when the cache
 * invalidation service is briefly unavailable; the normal cache lifetime is the fallback.
 */
export async function revalidateStorefront(
  tags: string[],
  logger: RevalidationLogger,
  env: RevalidationEnvironment = process.env,
  request: typeof fetch = fetch,
): Promise<boolean> {
  const endpoint = env.STOREFRONT_REVALIDATE_URL?.trim() ?? "";
  const secret = env.STOREFRONT_REVALIDATE_SECRET?.trim() ?? "";
  const uniqueTags = [...new Set(tags.filter(Boolean))];

  if (!endpoint && !secret) return false;
  if (!endpoint || !secret || uniqueTags.length === 0) {
    logger.warn("[storefront] cache revalidation is only partially configured; using cache TTL fallback");
    return false;
  }

  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      logger.warn("[storefront] refusing to send the cache secret over an insecure connection");
      return false;
    }

    const response = await request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify({ tags: uniqueTags }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      logger.warn(`[storefront] cache revalidation returned HTTP ${response.status}; using cache TTL fallback`);
      return false;
    }
    return true;
  } catch (error) {
    logger.warn(
      `[storefront] cache revalidation failed; using cache TTL fallback (${error instanceof Error ? error.message : String(error)})`,
    );
    return false;
  }
}
