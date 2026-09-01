import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { reindexProducts, removeFromIndex } from "../lib/search-indexer";

/**
 * Keeps the search index in step with the catalogue.
 *
 * 07_SYSTEM_ARCHITECTURE.md section 7: catalogue change → domain event → index worker.
 * ADR-014 permits this to lag briefly; nothing downstream treats the index as truth.
 *
 * Failures are logged and swallowed on purpose. A stale search result is a small,
 * self-correcting problem — the reconciliation job repairs it — whereas letting an
 * indexing error propagate would let a search outage block a product edit (REL-001).
 */
export default async function catalogSearchIndexHandler({
  event,
  container,
}: SubscriberArgs<{ id: string | string[] }>): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const ids = (Array.isArray(event.data.id) ? event.data.id : [event.data.id]).filter(Boolean);
  if (ids.length === 0) return;

  try {
    if (event.name === "product.deleted") {
      await removeFromIndex(container, ids);
      logger.info(`[search] removed ${ids.length} product(s) from the index`);
      return;
    }

    const { indexed } = await reindexProducts(container, ids);
    logger.info(`[search] reindexed ${indexed} product(s) after ${event.name}`);
  } catch (error) {
    logger.error(
      `[search] indexing failed for ${event.name} (${ids.join(", ")}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export const config: SubscriberConfig = {
  event: ["product.created", "product.updated", "product.deleted"],
};
