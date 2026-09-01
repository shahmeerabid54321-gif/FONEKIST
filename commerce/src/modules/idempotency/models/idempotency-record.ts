import { model } from "@medusajs/framework/utils";

/**
 * Persisted idempotency record. Source of truth: 02_TRD.md section 7 and
 * 09_API_AND_EVENT_CONTRACTS.md section 3.
 *
 * Mandatory for: order completion, payment session create, webhooks, refund/capture,
 * fulfilment, courier shipment create and notification jobs.
 */
export const IdempotencyRecord = model
  .define("idempotency_record", {
    id: model.id({ prefix: "idem" }).primaryKey(),
    /** Client-supplied key, or a provider event id for webhooks. */
    idempotency_key: model.text(),
    operation: model.text(),
    /**
     * Hash of the request payload. A matching key with a different hash is a client bug
     * (key reuse), not a legitimate retry, and is rejected with CONFLICT.
     */
    request_hash: model.text().nullable(),
    status: model.enum(["in_progress", "succeeded", "failed"]),
    /** Domain reference produced by the operation, e.g. the order id. */
    result_reference: model.text().nullable(),
    /** Full result, replayed verbatim so a retry returns the same semantic response. */
    result_payload: model.json().nullable(),
    error_code: model.text().nullable(),
    /** Guards against a crashed in-progress record blocking the key forever. */
    locked_until: model.dateTime().nullable(),
  })
  .indexes([
    // The uniqueness that makes the whole mechanism work.
    { on: ["idempotency_key", "operation"], unique: true },
    { on: ["status"] },
  ]);
