import { z } from "zod";

/**
 * Internal domain events. Source of truth: 09_API_AND_EVENT_CONTRACTS.md sections 9-11.
 * Names are versioned and past-tense. Breaking semantics increment the version suffix;
 * additive compatible fields stay on the same version (section 16).
 */
export const EVENT_TYPES = [
  "catalog.product.published.v1",
  "catalog.variant.stock_changed.v1",
  "order.placed.v1",
  "payment.confirmed.v1",
  "payment.failed.v1",
  "fulfillment.created.v1",
  "shipment.status_changed.v1",
  "return.requested.v1",
  "return.approved.v1",
  "refund.completed.v1",
  "installment.application.submitted.v1",
  "installment.decision.recorded.v1",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** Envelope from API contract section 10. Consumers must tolerate duplicates. */
export const eventEnvelopeSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.enum(EVENT_TYPES),
  occurred_at: z.string().datetime(),
  aggregate_id: z.string().min(1),
  correlation_id: z.string().min(1),
  data: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export const eventDataSchemas = {
  "catalog.product.published.v1": z.object({
    product_id: z.string(),
    slug: z.string(),
  }),
  "catalog.variant.stock_changed.v1": z.object({
    product_id: z.string(),
    variant_id: z.string(),
    available_quantity: z.number().int().nonnegative(),
  }),
  "order.placed.v1": z.object({
    order_id: z.string(),
    order_reference: z.string(),
    payment_method: z.string(),
    total: z.number().int().nonnegative(),
    currency: z.literal("PKR"),
    is_cod: z.boolean(),
  }),
  "payment.confirmed.v1": z.object({
    order_id: z.string(),
    payment_id: z.string(),
    provider: z.string(),
    provider_reference: z.string(),
    amount: z.number().int().nonnegative(),
    currency: z.literal("PKR"),
  }),
  "payment.failed.v1": z.object({
    order_id: z.string().nullable(),
    payment_id: z.string(),
    provider: z.string(),
    provider_reference: z.string().nullable(),
    reason_code: z.string(),
  }),
  "fulfillment.created.v1": z.object({
    order_id: z.string(),
    fulfillment_id: z.string(),
    line_item_ids: z.array(z.string()),
  }),
  "shipment.status_changed.v1": z.object({
    order_id: z.string(),
    shipment_id: z.string(),
    tracking_number: z.string().nullable(),
    state: z.string(),
    previous_state: z.string().nullable(),
  }),
  "return.requested.v1": z.object({
    return_request_id: z.string(),
    order_id: z.string(),
    reason_code: z.string(),
  }),
  "return.approved.v1": z.object({
    return_request_id: z.string(),
    order_id: z.string(),
    resolution: z.enum(["refund", "replacement", "repair"]),
  }),
  "refund.completed.v1": z.object({
    order_id: z.string(),
    payment_id: z.string(),
    amount: z.number().int().nonnegative(),
    currency: z.literal("PKR"),
  }),
  /*
   * Installments. Neither carries a CNIC, a document id or an address: an event is fanned
   * out to every consumer, and the identity data is governed by ADR-024.
   */
  "installment.application.submitted.v1": z.object({
    application_id: z.string(),
    order_id: z.string(),
    plan_id: z.string(),
  }),
  "installment.decision.recorded.v1": z.object({
    application_id: z.string(),
    order_id: z.string().nullable(),
    decision: z.enum(["approved", "rejected", "more_information_required", "expired"]),
  }),
} as const satisfies Record<EventType, z.ZodTypeAny>;

export type EventData<T extends EventType> = z.infer<(typeof eventDataSchemas)[T]>;

export interface DomainEvent<T extends EventType = EventType> {
  event_id: string;
  event_type: T;
  occurred_at: string;
  aggregate_id: string;
  correlation_id: string;
  data: EventData<T>;
}

export function buildEvent<T extends EventType>(
  type: T,
  input: {
    eventId: string;
    aggregateId: string;
    correlationId: string;
    data: EventData<T>;
    occurredAt?: Date;
  },
): DomainEvent<T> {
  // Validate at construction so a malformed event never reaches the bus.
  const data = eventDataSchemas[type].parse(input.data) as EventData<T>;
  return {
    event_id: input.eventId,
    event_type: type,
    occurred_at: (input.occurredAt ?? new Date()).toISOString(),
    aggregate_id: input.aggregateId,
    correlation_id: input.correlationId,
    data,
  };
}

export function parseEvent(raw: unknown): DomainEvent {
  const envelope = eventEnvelopeSchema.parse(raw);
  const data = eventDataSchemas[envelope.event_type].parse(envelope.data);
  return { ...envelope, data } as DomainEvent;
}
