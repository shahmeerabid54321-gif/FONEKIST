import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { reindexProducts } from "../lib/search-indexer";
import { revalidateStorefront } from "../lib/storefront-revalidation";

/** Keeps brand/category navigation and product facets current after built-in admin edits. */
export default async function categoryStorefrontIndexHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  try {
    const { indexed, pruned } = await reindexProducts(container);
    logger.info(`[search] reindexed ${indexed} product(s), pruned ${pruned}, after ${event.name}`);
  } catch (error) {
    logger.error(
      `[search] category reconciliation failed after ${event.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  await revalidateStorefront(["categories", "search"], logger);
}

export const config: SubscriberConfig = {
  event: ["product-category.created", "product-category.updated", "product-category.deleted"],
};
