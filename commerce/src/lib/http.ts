import { randomUUID } from "node:crypto";
import type { MedusaRequest } from "@medusajs/framework/http";
import { AppError, ERROR_STATUS, type ErrorCode, type FieldErrors } from "@pk/contracts";

/**
 * HTTP envelope helpers for custom API routes.
 * Source of truth: 09_API_AND_EVENT_CONTRACTS.md section 2.
 */

export function requestIdOf(req: MedusaRequest): string {
  const header = req.headers["x-request-id"];
  return (Array.isArray(header) ? header[0] : header) || `req_${randomUUID()}`;
}

export function ok<T>(data: T, requestId: string) {
  return { data, meta: { request_id: requestId } };
}

interface ExplicitError {
  code: ErrorCode;
  message: string;
  field_errors?: FieldErrors;
}

/**
 * Builds the error envelope. Internal detail never crosses this boundary — only the code,
 * a customer-safe message and field errors do (TRD section 9).
 */
export function fail(
  error: unknown,
  requestId: string,
  withStatus?: false,
): { error: ExplicitError & { field_errors: FieldErrors }; meta: { request_id: string } };
export function fail(
  error: unknown,
  requestId: string,
  withStatus: true,
): { status: number; body: { error: ExplicitError & { field_errors: FieldErrors }; meta: { request_id: string } } };
export function fail(error: unknown, requestId: string, withStatus = false) {
  const isExplicit =
    typeof error === "object" && error !== null && "code" in error && "message" in error;

  const responseError = isExplicit
    ? {
        code: (error as ExplicitError).code,
        message: (error as ExplicitError).message,
        field_errors: (error as ExplicitError).field_errors ?? {},
      }
    : AppError.from(error).toResponseError();

  const body = { error: responseError, meta: { request_id: requestId } };

  return withStatus ? { status: ERROR_STATUS[responseError.code], body } : body;
}

/**
 * Best-effort client identity for rate limiting.
 *
 * `x-forwarded-for` is attacker-controlled unless a trusted proxy sets it, so this is only
 * ever used to bucket rate limits — never to authorise anything (SEC-004).
 */
export function clientIpOf(req: MedusaRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  return (
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    "unknown"
  );
}
