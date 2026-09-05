import { AppError, type ErrorCode } from "@/lib/pk";
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
 */
const COLD_START_TIMEOUT_MS = 45_000;
const WAKE_COOLDOWN_MS = 60_000;

let lastWakeAttempt = 0;

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
    lastWakeAttempt = Date.now();
    return await attempt<T>(path, rest, COLD_START_TIMEOUT_MS);
  }
}

/**
 * True when a failure looks like a sleeping backend rather than a broken one, and when this
 * process has not already spent a long attempt finding that out in the last minute.
 */
function worthWaking(error: unknown, method: string | undefined, timeoutMs: number): boolean {
  if ((method ?? "GET").toUpperCase() !== "GET") return false;
  if (timeoutMs >= COLD_START_TIMEOUT_MS) return false;
  if (!(error instanceof AppError)) return false;
  if ((error.internal as { timedOut?: boolean } | undefined)?.timedOut !== true) return false;
  return Date.now() - lastWakeAttempt > WAKE_COOLDOWN_MS;
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
