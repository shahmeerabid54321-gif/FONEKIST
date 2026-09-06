import { cacheLife } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AppError, type ErrorCode } from "@/lib/pk";

/**
 * How a cached read carries a failure instead of throwing one.
 *
 * **The problem this exists for.** Next fills a `use cache` entry as its own unit of work,
 * and a fill that *throws* fails the prerender of whichever page needed it. Not the
 * component, the page. It does this however carefully the caller degrades: with the backend
 * unreachable, `degradeGracefully` caught every read, logged it, returned its fallback, the
 * shell rendered exactly as designed, and the build died anyway. That is what took two
 * deploys down. `<Suspense>` does not help either; it catches suspension, not errors.
 *
 * **Why the obvious fix was the wrong one.** The only thing that stops the fill throwing is
 * catching inside it, and CLAUDE.md forbids exactly that, for a good reason: a fallback
 * computed inside the scope is a fallback *cached* by the scope, so one timeout is stored as
 * "this handset has no plans" and served to everyone for an hour. An empty plan list, an
 * empty result page and a 404 for a product that exists are all the site asserting something
 * untrue, which is a worse failure than a red build.
 *
 * **What is stored instead.** The fill records *the failure*, not a fallback. `capture`
 * returns a discriminated result, so nothing false is ever cached: `{ ok: false }` means "the
 * read failed", never "there are none". `unwrap` then rebuilds the original `AppError` and
 * throws it **outside** the scope, which is where the fallback belonged all along, so every
 * `degradeGracefully` call site behaves exactly as it did before and pages degrade the way
 * they always have. The build survives because the fill completed; the customer sees the
 * same thing they saw before because the error still reaches the same handler.
 *
 * A failed entry also drops to the `minutes` profile, so an outage is not pinned for an hour
 * the way a successful read is. `seconds` would be better still and is not available: a
 * profile that short reads as dynamic during a blocking prerender and fails the static
 * routes, which is the same build failure by another route. `minutes` is the shortest life
 * that a fully static page can still be prerendered with, measured rather than assumed.
 *
 * **Why catching an error is not enough on its own.** A read that never settles never throws,
 * so there is nothing for the `catch` above to catch, and the fill hangs until Next's own
 * stall timer fires. That timer does not merely abort the fill: it assigns the error to
 * `workStore.invalidDynamicUsageError`, which fails the page's prerender whether or not
 * userland caught it. So `degradeGracefully` catching a `UseCacheTimeoutError` looks like a
 * handled failure in the log and still ends the build, which is exactly what a deploy showed:
 * `installments.cheapest failed; rendering without it` followed by a dead build.
 *
 * The deadline below is what closes that. Every captured read is raced against it, so a read
 * that stalls for any reason — a socket that never answers, a starved event loop, something
 * inside the framework — becomes a recorded failure rather than a hung fill. It is deliberately
 * longer than the slowest legitimate chain `lib/medusa.ts` can produce and shorter than the
 * fill timeout pinned in `next.config.ts`, and both ends of that are asserted rather than
 * assumed: `medusa.ts` fails at import if its ladder outgrows this, and the config comment
 * carries the other half.
 */
export type Degradable<T> =
  | { ok: true; value: T }
  | { ok: false; code: ErrorCode; message: string; internal: unknown };

/**
 * Everything stored in a cache entry is serialised, and an `AppError`'s `internal` routinely
 * holds a `cause` that is a live `Error`. Reduced to plain JSON so a failure cannot become an
 * unserialisable cache entry, which would fail the fill in a new and more confusing way.
 */
function serialisable(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value ?? null));
  } catch {
    return String(value);
  }
}

/** Signals Next throws to mean redirect, notFound or a client-side bailout. */
function isControlFlowDigest(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return (
    typeof digest === "string" &&
    (digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("BAILOUT_TO_CLIENT_SIDE_RENDERING"))
  );
}

/**
 * How long a cached read may take before it is treated as failed.
 *
 * Not a network timeout: `lib/medusa.ts` already gives every request one of those, and its
 * whole retry ladder is asserted to finish inside this. This is the backstop for a read that
 * does not settle at all, which is a different failure and the one that has actually taken
 * deploys down. A stalled fill cannot be caught, only outlived.
 */
export const CACHE_READ_DEADLINE_MS = 45_000;

/**
 * Races a read against the deadline.
 *
 * The losing read is abandoned rather than cancelled, which is correct here: the caller has
 * no handle to cancel and the value would be discarded anyway. `Promise.race` has already
 * attached handlers to it, so a late rejection is not an unhandled one, and an abandoned
 * promise is not part of the cache entry so it cannot hold the fill open.
 */
async function withDeadline<T>(read: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new AppError("PROVIDER_UNAVAILABLE", {
              message: "The store is taking longer than usual to respond. Please try again.",
              internal: { stalled: true, deadlineMs: CACHE_READ_DEADLINE_MS },
            }),
          );
        }, CACHE_READ_DEADLINE_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs a read inside a `use cache` scope so the scope completes whatever the read does. */
export async function capture<T>(read: () => Promise<T>): Promise<Degradable<T>> {
  try {
    return { ok: true, value: await withDeadline(read) };
  } catch (error) {
    // Redirect, notFound and the dynamic-rendering bailout are control flow, not failures.
    // Storing one as a cached error would silently convert a redirect into an outage, and
    // cache it. `degradeGracefully` carries the same pair of checks for the same reason:
    // `unstable_rethrow` knows the current shapes, and the digest test is the backstop for
    // the ones it does not, which a unit test caught it missing.
    unstable_rethrow(error);
    if (isControlFlowDigest(error)) throw error;

    // Only reached when the read genuinely failed, so an outage is held for minutes rather
    // than inheriting the hour a successful catalogue read is entitled to.
    cacheLife("minutes");

    const appError = AppError.from(error);
    return {
      ok: false,
      code: appError.code,
      message: appError.message,
      internal: serialisable(appError.internal),
    };
  }
}

/**
 * Rethrows a captured failure, outside the cache scope.
 *
 * The error that comes back out is the one that went in, so callers keep matching on
 * `PROVIDER_UNAVAILABLE`, `NOT_FOUND` and the rest exactly as before.
 */
export function unwrap<T>(result: Degradable<T>): T {
  if (result.ok) return result.value;
  throw new AppError(result.code, { message: result.message, internal: result.internal });
}
