import { AppError, type ErrorCode } from "@/lib/pk";
import { unstable_rethrow } from "next/navigation";
import { CACHE_READ_DEADLINE_MS } from "./cached-read";
import { publicEnv, serverEnv } from "./env";

/**
 * Thin server-side client for the Medusa Store API.
 *
 * TRD section 3: the storefront owns presentation and composition; it does not own
 * authoritative price, inventory, payment or order state. Every call here is a read from,
 * or a write to, the commerce backend — the storefront never computes a total or decides
 * whether something is in stock on its own.
 *
 * Every request carries an explicit timeout (API contract section 13). A timeout means
 * unknown, not failed, and is surfaced as PROVIDER_UNAVAILABLE so callers do not retry a
 * write blindly.
 */

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * The budget for one retry after a read has timed out, and how often that is worth paying.
 *
 * The backend runs on an instance that stops when nothing has called it for a while and
 * takes most of a minute to come back. The request that wakes it is the one that pays for
 * the wake, and at eight seconds it aborts long before the container is listening, so a
 * customer arriving after a quiet hour got `PROVIDER_UNAVAILABLE` on every page until
 * somebody happened to keep reloading long enough to boot it.
 *
 * So a read that times out is given one longer attempt. Only a read: a write that timed out
 * may well have been applied, and sending it again on the guess that it was not is how a
 * customer ends up with two applications (INST-007).
 *
 * The cooldown is what stops this becoming a tax. A backend that is genuinely down would
 * otherwise cost every page the full long budget before it could render anything at all,
 * which is far worse for the customer than a fast failure. One request a minute carries the
 * wake; everything else still gives up in eight seconds and degrades.
 *
 * "One request" is load-bearing, and it did not used to be true. `lastWakeAttempt` was
 * written *after* the first attempt failed, so a page that fans out — the home page fires
 * five reads at once — had every branch time out at eight seconds, every branch read the
 * same stale timestamp, and every branch escalate to its own long attempt in parallel. The
 * wake was supposed to cost one request a minute and instead cost all of them. The claim is
 * now taken before the attempt, and a second flag makes a wake that is already running
 * visible to everyone else, so exactly one caller ever pays it.
 *
 * That single claim is now load-bearing for a second reason: it is what bounds the worst
 * nested chain against the cache-fill ceiling described below.
 *
 * With the read layer cached (`lib/catalog.ts`, `lib/search.ts`), a warm cache serves while
 * revalidation happens behind it, so in steady state no customer waits on a wake at all.
 */

/**
 * The budget this ladder has to fit inside, and where that number now comes from.
 *
 * Every catalogue read runs inside a `use cache` scope (`lib/catalog.ts`, `lib/search.ts`),
 * and a scope that outlives its fill budget does not merely degrade: Next records the stall
 * on the work store and the page's prerender fails, so during a build it ends the deploy.
 *
 * This used to name Next's own fill timeout, as a hard fifty seconds that could not be
 * changed. Both halves were wrong. `experimental.useCacheTimeout` sets it, and when it is not
 * set Next derives it from `staticPageGenerationTimeout` — ninety per cent of it — so this
 * project's real ceiling was a hundred and sixty-two seconds, not fifty, and an assertion
 * against fifty was guarding a number that never applied. `next.config.ts` now pins it.
 *
 * What this ladder is actually measured against is `CACHE_READ_DEADLINE_MS`, the deadline
 * `capture` enforces inside the scope, because that is the one that fires first by design.
 * The ladder has to finish inside it or a working-but-slow backend would be cut off by a
 * backstop meant for a stalled one.
 *
 * Nesting sets the arithmetic. `getProductByHandle` awaits `getRegionId`, one cache scope
 * inside another, and the inner fill's time counts against the outer's. Only one caller ever
 * holds the wake (`claimWake`), so the worst chain is one full ladder plus one fast failure:
 * 8 + 25 + 8 = 41s, inside the 45s deadline. Raising any of these means redoing this.
 */
const COLD_START_TIMEOUT_MS = 25_000;
const WAKE_COOLDOWN_MS = 60_000;

/**
 * Shortening the wake costs less than it looks like it should.
 *
 * What actually boots a sleeping Render instance is the request arriving at it, not our
 * willingness to keep waiting for the reply. Aborting at twenty-five seconds still starts
 * the container; it only decides whether *this* caller serves live data or degrades, and a
 * free instance often takes longer than forty-five seconds anyway, so that branch was
 * already unreliable. The wake's real value is for the request after this one.
 */
if (COLD_START_TIMEOUT_MS + DEFAULT_TIMEOUT_MS * 2 >= CACHE_READ_DEADLINE_MS) {
  throw new Error(
    "The Medusa retry ladder no longer fits inside the cached-read deadline. " +
      "Lower COLD_START_TIMEOUT_MS: a ladder that outlives the deadline turns a slow " +
      "backend into a stalled one and takes the production build with it.",
  );
}

let lastWakeAttempt = 0;
let wakeInFlight = false;

/**
 * Takes the right to spend a long attempt, if it is going and nobody else has it.
 *
 * Claiming marks the clock immediately, so concurrent callers that fail in the same instant
 * see the claim rather than a stale timestamp.
 */
function claimWake(): boolean {
  if (wakeInFlight) return false;
  if (Date.now() - lastWakeAttempt <= WAKE_COOLDOWN_MS) return false;
  lastWakeAttempt = Date.now();
  wakeInFlight = true;
  return true;
}

export interface MedusaRequestOptions extends Omit<RequestInit, "signal"> {
  timeoutMs?: number;
  /** Next.js cache directives. Purchase-critical reads must pass `cache: "no-store"`. */
  next?: { revalidate?: number | false; tags?: string[] };
}

export async function medusaFetch<T>(
  path: string,
  options: MedusaRequestOptions = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options;

  try {
    return await attempt<T>(path, rest, timeoutMs);
  } catch (error) {
    if (!worthWaking(error, rest.method, timeoutMs)) throw error;
    if (!claimWake()) throw error;
    try {
      return await attempt<T>(path, rest, COLD_START_TIMEOUT_MS);
    } finally {
      wakeInFlight = false;
    }
  }
}

/**
 * True when a failure looks like a sleeping backend rather than a broken one.
 *
 * Whether this process is *allowed* to act on that is `claimWake`'s decision, not this
 * one's; keeping the two apart is what stops the cooldown being checked once and acted on
 * several times.
 */
function worthWaking(error: unknown, method: string | undefined, timeoutMs: number): boolean {
  if ((method ?? "GET").toUpperCase() !== "GET") return false;
  if (timeoutMs >= COLD_START_TIMEOUT_MS) return false;
  if (!(error instanceof AppError)) return false;
  return (error.internal as { timedOut?: boolean } | undefined)?.timedOut === true;
}

async function attempt<T>(
  path: string,
  options: Omit<MedusaRequestOptions, "timeoutMs">,
  timeoutMs: number,
): Promise<T> {
  const { headers, ...rest } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${serverEnv.MEDUSA_BACKEND_URL}${path}`, {
      ...rest,
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": publicEnv.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await toAppError(response);
    }

    // 204 and other empty bodies are legitimate for writes.
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;

    // `fetch` also rejects with Next's internal render-control errors when a prerender or
    // navigation no longer needs the request. Wrapping those as PROVIDER_UNAVAILABLE turns
    // normal PPR cancellation into a false Medusa outage and lets graceful fallbacks swallow
    // framework control flow. The framework helper knows every current control-flow shape.
    unstable_rethrow(error);

    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("PROVIDER_UNAVAILABLE", {
        message: "The store is taking longer than usual to respond. Please try again.",
        internal: { path, timeoutMs, timedOut: true },
      });
    }

    throw new AppError("PROVIDER_UNAVAILABLE", { internal: { path, error }, cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

/** Maps a Medusa error response onto the shared taxonomy (TRD section 9). */
async function toAppError(response: Response): Promise<AppError> {
  let body: { message?: string; type?: string; code?: string } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    // A non-JSON error body is not worth failing over; the status still carries meaning.
  }

  const byStatus: Record<number, ErrorCode> = {
    400: "VALIDATION_ERROR",
    401: "AUTHENTICATION_REQUIRED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
  };

  const code: ErrorCode =
    byStatus[response.status] ?? (response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "INTERNAL_ERROR");

  // Medusa signals insufficient stock through its own `code` ("insufficient_inventory")
  // and message wording. Both are checked so the application UI shows the stock-specific
  // recovery path (CUST-009) rather than a generic validation failure.
  const signals = `${body.code ?? ""} ${body.type ?? ""} ${body.message ?? ""}`;
  if (/insufficient_inventory|not have enough|required inventory|out of stock/i.test(signals)) {
    return new AppError("OUT_OF_STOCK", { internal: body });
  }

  return new AppError(code, { internal: { status: response.status, body } });
}
