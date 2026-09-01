/**
 * In-process rate limiter for abuse-sensitive endpoints (SEC-004).
 *
 * Deliberately simple and honest about its scope: the counters live in this process, so
 * with more than one commerce instance the effective limit is per instance. That is
 * acceptable for order lookup and OTP endpoints at launch scale and is the reason
 * `REDIS_URL` exists — a shared store replaces this without changing call sites.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Periodic sweep so a long-running process does not accumulate expired keys. */
function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Test helper. */
export function resetRateLimits(): void {
  buckets.clear();
}
