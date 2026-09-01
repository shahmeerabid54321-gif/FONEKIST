/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/errors/app-error.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

import { ERROR_DEFAULT_MESSAGE, ERROR_STATUS, INDETERMINATE_CODES, type ErrorCode } from "./codes";

/** Field-level validation detail, keyed by form field path. */
export type FieldErrors = Record<string, string[]>;

export interface AppErrorOptions {
  /** Customer-safe message. Falls back to the taxonomy default. */
  message?: string;
  fieldErrors?: FieldErrors;
  /** Internal-only detail: logged, never serialised to a customer response. */
  internal?: unknown;
  cause?: unknown;
}

/**
 * The only error type crossing an API boundary.
 *
 * `message` and `fieldErrors` are customer-safe. `internal` never leaves the server —
 * `toResponseError()` deliberately omits it (02_TRD.md section 9).
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: FieldErrors;
  readonly internal?: unknown;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? ERROR_DEFAULT_MESSAGE[code], { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (options.fieldErrors) this.fieldErrors = options.fieldErrors;
    if (options.internal !== undefined) this.internal = options.internal;
  }

  /** True when the outcome is unknown rather than failed — do not retry blindly. */
  get isIndeterminate(): boolean {
    return INDETERMINATE_CODES.has(this.code);
  }

  /** Customer-safe projection. Never includes `internal` or a stack trace. */
  toResponseError(): { code: ErrorCode; message: string; field_errors: FieldErrors } {
    return {
      code: this.code,
      message: this.message,
      field_errors: this.fieldErrors ?? {},
    };
  }

  static is(value: unknown): value is AppError {
    return value instanceof AppError;
  }

  /**
   * Coerce anything thrown into an AppError. Unknown throwables become INTERNAL_ERROR
   * with the original preserved as internal detail so logs keep the cause while the
   * customer only ever sees the generic message.
   */
  static from(value: unknown): AppError {
    if (AppError.is(value)) return value;
    return new AppError("INTERNAL_ERROR", { internal: value, cause: value });
  }
}

export const validationError = (fieldErrors: FieldErrors, message?: string): AppError =>
  new AppError("VALIDATION_ERROR", message ? { fieldErrors, message } : { fieldErrors });

export const notFound = (what: string): AppError =>
  new AppError("NOT_FOUND", { message: `We could not find that ${what}.` });

export const outOfStock = (internal?: unknown): AppError =>
  new AppError("OUT_OF_STOCK", internal !== undefined ? { internal } : {});

export const priceChanged = (internal?: unknown): AppError =>
  new AppError("PRICE_CHANGED", internal !== undefined ? { internal } : {});
