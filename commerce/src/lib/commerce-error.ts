import { AppError, isErrorCode } from "@pk/contracts";

/** Preserve domain conflicts across the idempotency boundary without exposing ORM errors. */
export function commerceError(error: unknown): AppError {
  if (AppError.is(error)) return error;
  const detail = error as {
    type?: string;
    message?: string;
    responseError?: { code?: unknown; message?: string };
  } | null;
  if (detail?.responseError && isErrorCode(detail.responseError.code)) {
    return new AppError(detail.responseError.code, { message: detail.responseError.message });
  }
  if (detail?.type === "not_allowed" && /insufficient inventory|not enough stock|not enough inventory/i.test(detail.message ?? "")) {
    return new AppError("OUT_OF_STOCK");
  }
  if (detail?.type === "duplicate_error" || detail?.type === "conflict") {
    return new AppError("CONFLICT");
  }
  return AppError.from(error);
}

/** Only the guest-customer unique race is safe to retry during cart-address preparation. */
export function isGuestCustomerRace(error: unknown): boolean {
  const detail = error as { type?: string; message?: string } | null;
  return (detail?.type === "duplicate_error" || detail?.type === "invalid_data") &&
    /Customer with email:.*has_account: false, already exists\./.test(detail.message ?? "");
}
