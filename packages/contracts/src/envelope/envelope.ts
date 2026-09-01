import { z } from "zod";
import { ERROR_CODES } from "../errors/codes.js";
import { AppError } from "../errors/app-error.js";

/**
 * Custom API envelope. Source of truth: 09_API_AND_EVENT_CONTRACTS.md section 2.
 * Every custom endpoint returns exactly one of these two shapes.
 */

export const metaSchema = z.object({
  request_id: z.string().min(1),
});
export type Meta = z.infer<typeof metaSchema>;

export const responseErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
  field_errors: z.record(z.array(z.string())).default({}),
});
export type ResponseError = z.infer<typeof responseErrorSchema>;

export interface SuccessEnvelope<T> {
  data: T;
  meta: Meta;
}

export interface ErrorEnvelope {
  error: ResponseError;
  meta: Meta;
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/** Builds the success envelope schema for a given payload schema. */
export const successEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ data, meta: metaSchema });

export const errorEnvelopeSchema = z.object({
  error: responseErrorSchema,
  meta: metaSchema,
});

export const ok = <T>(data: T, requestId: string): SuccessEnvelope<T> => ({
  data,
  meta: { request_id: requestId },
});

/** Serialises any throwable into the error envelope, stripping internal detail. */
export const fail = (error: unknown, requestId: string): ErrorEnvelope => ({
  error: AppError.from(error).toResponseError(),
  meta: { request_id: requestId },
});

export const isErrorEnvelope = <T>(value: Envelope<T>): value is ErrorEnvelope =>
  "error" in value;

/** Header name carrying the idempotency key (API contract section 3). */
export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
/** Header name echoing the request/trace id used in structured logs (TRD section 13). */
export const REQUEST_ID_HEADER = "x-request-id";
