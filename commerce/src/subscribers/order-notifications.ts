import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { sendNotification } from "../lib/notifications/send";
import type { NotificationTemplate } from "../lib/notifications/templates";

/**
 * Customer notifications for the order lifecycle.
 *
 * 07_SYSTEM_ARCHITECTURE.md section 12 lists which events deserve a message; nothing else
 * gets one. Section 13 requires that a notification failure cannot corrupt order flow, so
 * this subscriber never throws — `sendNotification` swallows and logs.
 *
 * Idempotency keys are derived from the event and the aggregate, because event consumers
 * must tolerate duplicates (09_API_AND_EVENT_CONTRACTS.md section 10) and a customer must
 * not receive the same message twice because a queue redelivered.
 */

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "total",
  "canceled_at",
  "payment_collections.payments.provider_id",
  "payment_collections.payments.amount",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.labels.tracking_number",
  "fulfillments.labels.tracking_url",
];

interface OrderRow {
  id: string;
  display_id: number;
  email: string | null;
  total: number;
  payment_collections?: { payments?: { provider_id: string; amount: number }[] }[];
  fulfillments?: {
    id: string;
    shipped_at: string | null;
    delivered_at: string | null;
    labels?: { tracking_number: string; tracking_url: string | null }[];
  }[];
}

export default async function orderNotificationsHandler({
  event,
  container,
}: SubscriberArgs<{ id: string; order_id?: string }>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // A fulfilment event carries the fulfilment id; the order id arrives alongside it.
  const orderId = event.data.order_id ?? event.data.id;
  if (!orderId) return;

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: { id: orderId },
  });

  // The graph's generated types describe `display_id` loosely; the row shape used here is
  // narrow and read-only, so it is asserted once rather than threaded through every field.
  const order = orders?.[0] as unknown as OrderRow | undefined;
  if (!order?.email) {
    logger.warn(`[notification] order ${orderId} has no email; nothing sent for ${event.name}`);
    return;
  }

  const isCod =
    order.payment_collections?.some((collection) =>
      collection.payments?.some((payment) => payment.provider_id.includes("cod")),
    ) ?? false;

  const shipment = order.fulfillments?.find((fulfillment) => fulfillment.shipped_at);
  const label = shipment?.labels?.[0];

  const plan = messagesFor(event.name, { order, isCod });

  for (const message of plan) {
    await sendNotification(container, {
      to: order.email,
      channel: "email",
      template: message.template,
      data: {
        order_reference: order.display_id,
        total: order.total,
        is_cod: isCod,
        tracking_number: label?.tracking_number ?? null,
        tracking_url: label?.tracking_url ?? null,
        ...message.data,
      },
      // Event plus aggregate plus template: a redelivered event resolves to the same key.
      idempotencyKey: `${event.name}:${orderId}:${message.template}`,
    });
  }
}

function messagesFor(
  eventName: string,
  context: { order: OrderRow; isCod: boolean },
): { template: NotificationTemplate; data?: Record<string, unknown> }[] {
  switch (eventName) {
    case "order.placed":
      // A COD order gets two messages because they say different things: one confirms we
      // have the order, the other explains that we will call before dispatch.
      return context.isCod
        ? [{ template: "order.received" }, { template: "order.cod_confirmation_required" }]
        : [{ template: "order.received" }];

    case "payment.captured":
      // A COD order is "captured" when the courier hands over the cash, by which point the
      // customer is holding the goods and does not need an email about it.
      return context.isCod ? [] : [{ template: "payment.confirmed" }];

    case "shipment.created":
      return [{ template: "order.shipped" }];

    case "delivery.created":
      return [{ template: "order.delivered" }];

    case "order.canceled":
      return [{ template: "order.cancelled" }];

    case "payment.refunded":
      return [{ template: "refund.completed" }];

    default:
      return [];
  }
}

export const config: SubscriberConfig = {
  event: [
    "order.placed",
    "payment.captured",
    "payment.refunded",
    "shipment.created",
    "delivery.created",
    "order.canceled",
  ],
};
