/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/envelope/idempotency.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

import { z } from "zod";

/**
 * Operations that MUST accept an Idempotency-Key. Source of truth: 02_TRD.md section 7.
 * This list is closed: adding a duplicate-risk write means adding it here.
 */
export const IDEMPOTENT_OPERATIONS = [
  "order.complete",
  "payment.session.create",
  "payment.webhook",
  "payment.refund",
  "payment.capture",
  "fulfillment.create",
  "courier.shipment.create",
  "notification.job",
  /**
   * Reviewing a return. Not in TRD section 7's original list, which enumerated the
   * payment and fulfilment paths; a double-clicked approval is the same class of problem
   * — it would refund twice — so it is added here rather than left to chance.
   */
  "return.decision",
  /**
   * Submitting an installment application. A double-tapped submit would otherwise create
   * two applications, two stock reservations and two review-queue entries for one
   * customer, and the second reservation would hold a unit nobody is buying (INST-007).
   */
  "installment.application.submit",
  /**
   * A reviewer's approve/reject/request-information decision. A double-clicked approval
   * would send the customer two notifications and write two audit trails for one act
   * (INST-008).
   */
  "installment.decision",
] as const;

export type IdempotentOperation = (typeof IDEMPOTENT_OPERATIONS)[number];

export const idempotencyStatuses = ["in_progress", "succeeded", "failed"] as const;
export type IdempotencyStatus = (typeof idempotencyStatuses)[number];

/**
 * Persisted idempotency record (TRD section 7: key, operation, result/reference, status,
 * timestamps). `request_hash` guards against the same key being reused for a different
 * payload, which is a client bug rather than a legitimate retry.
 */
export const idempotencyRecordSchema = z.object({
  key: z.string().min(1).max(255),
  operation: z.enum(IDEMPOTENT_OPERATIONS),
  request_hash: z.string().nullable(),
  status: z.enum(idempotencyStatuses),
  result_reference: z.string().nullable(),
  result_payload: z.unknown().nullable(),
  error_code: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;

export const idempotencyKeySchema = z.string().uuid({
  message: "Idempotency-Key must be a UUID.",
});
