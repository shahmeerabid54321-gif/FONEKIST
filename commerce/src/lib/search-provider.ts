import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import type { SearchProvider } from "@pk/contracts";
import { SEARCH_MODULE } from "../modules/search";
import type SearchIndexService from "../modules/search/service";
import { PostgresSearchProvider, type SqlExecutor } from "../modules/search/postgres-provider";

/**
 * Resolves the configured search provider.
 *
 * One place decides which engine answers a search. ADR-004's Typesense implementation
 * lands here as a second branch selected by configuration — the same containment as
 * ADR-019's Redis switch in `medusa-config.ts`, and for the same reason: nothing above
 * this line should know which engine it is talking to.
 */
export function resolveSearchProvider(container: MedusaContainer): SearchProvider {
  const sql = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as SqlExecutor;
  const index: SearchIndexService = container.resolve(SEARCH_MODULE);
  return new PostgresSearchProvider(sql, index);
}
