import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { WARRANTY_MODULE } from "../modules/warranty";
import type WarrantyService from "../modules/warranty/service";

/**
 * Writes the purchase-time warranty snapshot onto every line of a placed order.
 *
 * WAR-001 / 08_DATA_MODEL.md section 8: the order line preserves the warranty that was
 * promised at purchase, and later catalog edits must not rewrite it.
 *
 * Runs as a subscriber rather than inside the completion workflow deliberately
 * (REL-001, TRD section 8): order creation must not fail because a downstream step is
 * unavailable. The snapshot is idempotent per line, so a retry is safe, and a missing
 * snapshot is recoverable by replaying the event.
 */
export default async function orderPlacedWarrantyHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const warranty: WarrantyService = container.resolve(WARRANTY_MODULE);

  const orderId = event.data.id;

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "items.id", "items.product_id", "items.variant_id"],
    filters: { id: orderId },
  });

  const order = orders?.[0];
  if (!order) {
    logger.warn(`[warranty] order ${orderId} not found; cannot snapshot warranty`);
    return;
  }

  let written = 0;

  for (const item of order.items ?? []) {
    if (!item?.id || !item.product_id) continue;

    try {
      await warranty.snapshotOrderLine({
        orderId: order.id,
        orderLineId: item.id,
        productId: item.product_id,
        variantId: item.variant_id ?? null,
      });
      written += 1;
    } catch (error) {
      // One failed line must not abandon the rest: a partially snapshotted order is
      // recoverable, an unsnapshotted one is a warranty dispute waiting to happen.
      logger.error(
        `[warranty] failed to snapshot line ${item.id} of order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  logger.info(`[warranty] snapshotted ${written} line(s) for order ${orderId} (WAR-001)`);
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
