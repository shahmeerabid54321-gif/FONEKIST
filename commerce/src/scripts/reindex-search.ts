import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { ExecArgs } from "@medusajs/framework/types";
import { reindexProducts } from "../lib/search-indexer";

/**
 * On-demand full search reindex.
 *
 * 07_SYSTEM_ARCHITECTURE.md section 7 lists a full rebuild alongside incremental updates
 * as a requirement, precisely so that a broken index is an operational inconvenience
 * rather than an incident. Safe to run at any time: it is an upsert plus a prune.
 */
export default async function reindexSearch({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const started = Date.now();
  const { indexed, pruned } = await reindexProducts(container);

  logger.info(
    `Search reindex complete: ${indexed} document(s) written, ${pruned} pruned, in ${Date.now() - started}ms.`,
  );
}
