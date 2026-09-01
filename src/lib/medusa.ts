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

export interface MedusaRequestOptions extends Omit<RequestInit, "signal"> {
  timeoutMs?: number;
  /** Next.js cache directives. Purchase-critical reads must pass `cache: "no-store"`. */
  next?: { revalidate?: number | false; tags?: string[] };
}

export async function medusaFetch<T>(
  path: string,
  options: MedusaRequestOptions = {},
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options;

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
        internal: { path, timeoutMs },
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
  // and message wording. Both are checked so the checkout UI shows the stock-specific
  // recovery path (CUST-009) rather than a generic validation failure.
  const signals = `${body.code ?? ""} ${body.type ?? ""} ${body.message ?? ""}`;
  if (/insufficient_inventory|not have enough|required inventory|out of stock/i.test(signals)) {
    return new AppError("OUT_OF_STOCK", { internal: body });
  }

  return new AppError(code, { internal: { status: response.status, body } });
}
