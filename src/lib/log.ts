import { AppError } from "@/lib/pk";
import { unstable_rethrow } from "next/navigation";

/**
 * Server-side structured logging.
 *
 * TRD section 13: logs carry timestamp, environment, service, request/trace id and error
 * code, and never contain card data, passwords, tokens or unnecessary PII.
 *
 * This exists mainly so that a degraded-but-rendered page (REL-001) is still *visible* in
 * the logs. Swallowing an error to keep the page up is correct; swallowing it silently is
 * not — that is how a broken section stays broken for a week.
 */

type Level = "info" | "warn" | "error";

interface LogContext {
  operation: string;
  requestId?: string;
  basketId?: string;
  orderId?: string;
  [key: string]: unknown;
}

const REDACTED_KEYS = /^(password|token|secret|authorization|card|pan|cvv|cvc|email|phone)$/i;

function redact(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) =>
      REDACTED_KEYS.test(key) ? [key, "[redacted]"] : [key, redact(entry)],
    ),
  );
}

function emit(level: Level, message: string, context: LogContext, error?: unknown): void {
  const appError = error === undefined ? null : AppError.from(error);

  const entry = {
    // Cache Components deliberately rejects ambient wall-clock reads while prerendering.
    // Logging is telemetry rather than rendered output, so use the monotonic clock Next
    // explicitly permits and translate it back to an ISO timestamp for the log transport.
    timestamp: new Date(performance.timeOrigin + performance.now()).toISOString(),
    environment: process.env.NODE_ENV ?? "development",
    service: "fonekist",
    level,
    message,
    ...(redact(context) as Record<string, unknown>),
    ...(appError
      ? {
          error_code: appError.code,
          error_message: appError.message,
          // Internal detail is for operators only and is already free of customer-facing
          // secrets by construction; still passed through the redactor.
          error_internal: redact(appError.internal),
        }
      : {}),
  };

  // eslint-disable-next-line no-console -- structured JSON to stdout is the log transport
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

export const log = {
  info: (message: string, context: LogContext) => emit("info", message, context),
  warn: (message: string, context: LogContext, error?: unknown) =>
    emit("warn", message, context, error),
  error: (message: string, context: LogContext, error?: unknown) =>
    emit("error", message, context, error),
};

/**
 * Runs a non-critical read, returning a fallback if it fails.
 *
 * Use only where a failure genuinely should not break the page (REL-001). Never use it on
 * the purchase path, where a swallowed failure would show the customer a wrong price or a
 * false success.
 */
export async function degradeGracefully<T>(
  operation: string,
  fallback: T,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    // Next signals redirect, notFound and the dynamic-rendering bailout by throwing. Those
    // are control flow, not failures: swallowing one turns a redirect into a blank section,
    // and swallowing the dynamic bailout makes a page silently render without the data it
    // asked for while logging it as an outage every single build.
    unstable_rethrow(error);
    if (isLegacyControlFlow(error)) throw error;

    log.warn(`${operation} failed; rendering without it`, { operation }, error);
    return fallback;
  }
}

/** Compatibility with signals emitted by older Next builds and retained test fixtures. */
function isLegacyControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  return (
    typeof digest === "string" &&
    (digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("BAILOUT_TO_CLIENT_SIDE_RENDERING"))
  );
}
