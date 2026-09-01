import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COD_VERIFICATION_MODULE } from "../modules/cod-verification";
import type CodVerificationService from "../modules/cod-verification/service";

/**
 * Links a COD confirmation challenge to the order it authorised.
 *
 * The challenge is raised against a cart, because it happens before the order exists. Once
 * the order does exist, operations need to be able to answer "was this order confirmed,
 * and when?" without knowing the cart id — that question comes up whenever a delivery is
 * refused at the door.
 *
 * A failure here loses an audit link, not an order, so it is logged and swallowed
 * (REL-001).
 */
export default async function orderPlacedCodVerificationHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  try {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "cart.id"],
      filters: { id: event.data.id },
    });

    const cartId = (orders?.[0] as { cart?: { id?: string } } | undefined)?.cart?.id;
    if (!cartId) return;

    const verification: CodVerificationService = container.resolve(COD_VERIFICATION_MODULE);
    await verification.attachOrder(cartId, event.data.id);
  } catch (error) {
    logger.warn(
      `[cod] could not link a confirmation to order ${event.data.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
