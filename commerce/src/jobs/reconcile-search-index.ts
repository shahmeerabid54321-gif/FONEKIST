import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { reindexProducts } from "../lib/search-indexer";

/**
 * Scheduled full reconciliation of the search index.
 *
 * 07_SYSTEM_ARCHITECTURE.md section 7 requires scheduled reconciliation *as well as*
 * incremental updates, because incremental updates are exactly the thing that silently
 * stops working. Price and stock changes in particular do not always arrive as a product
 * event, so without this a card could advertise a price the PDP no longer honours.
 *
 * ADR-019: with the in-memory workflow engine this only runs while the process is up.
 * Durable scheduling is a staging/production property, provided by Redis.
 */
export default async function reconcileSearchIndex(container: MedusaContainer): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const { indexed, pruned } = await reindexProducts(container);
  logger.info(`[search] reconciliation complete: ${indexed} indexed, ${pruned} pruned`);
}

export const config = {
  name: "reconcile-search-index",
  // Hourly. Frequent enough that a missed event is a short-lived inconsistency, rare
  // enough that a full rebuild is not competing with customer traffic.
  schedule: "0 * * * *",
};
