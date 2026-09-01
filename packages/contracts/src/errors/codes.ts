/**
 * Canonical application error taxonomy.
 *
 * Source of truth: 02_TRD.md section 9. This list is closed — a new failure mode must be
 * mapped onto one of these codes or the taxonomy must be amended in the TRD first.
 */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "OUT_OF_STOCK",
  "PRICE_CHANGED",
  "PAYMENT_FAILED",
  "PAYMENT_PENDING",
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status for each code. Kept beside the taxonomy so transports stay consistent. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  PRICE_CHANGED: 409,
  PAYMENT_FAILED: 402,
  // Pending is not a failure. The caller must poll or wait for the webhook (ADR-007).
  PAYMENT_PENDING: 202,
  PROVIDER_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Customer-safe default messages. TRD section 9: never expose stack traces or provider
 * secrets to customers, so every code has a message that is safe to render as-is.
 */
export const ERROR_DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Some of the details provided need to be corrected.",
  AUTHENTICATION_REQUIRED: "Please sign in to continue.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "We could not find what you were looking for.",
  CONFLICT: "This action conflicts with the current state. Please refresh and try again.",
  OUT_OF_STOCK: "The selected item is no longer available in that quantity.",
  PRICE_CHANGED: "The price of an item in your cart changed. Please review the new total.",
  PAYMENT_FAILED: "The payment could not be completed. No order was placed.",
  PAYMENT_PENDING: "Payment confirmation pending. We will update your order shortly.",
  PROVIDER_UNAVAILABLE: "A service we rely on is temporarily unavailable. Please try again.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

/**
 * Codes that describe an unknown-not-failed outcome. API contract section 13: a timeout
 * means unknown, never failed, and must not trigger a naive retry of a payment write.
 */
export const INDETERMINATE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "PAYMENT_PENDING",
  "PROVIDER_UNAVAILABLE",
]);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
