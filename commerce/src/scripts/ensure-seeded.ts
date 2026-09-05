import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import fetchPlaceholderPhotos from "./fetch-placeholder-photos";
import seed from "./seed";

/**
 * Seeds a new deployment once, while keeping later process starts quick. The publishable
 * key is logged on every boot so the storefront service can be configured from Render
 * without enabling the Medusa admin UI.
 *
 * Catalogue reconciliation used to run unconditionally here. On a sleeping Render web
 * service that turned every wake-up into a full product/image/search-index pass before the
 * HTTP server could start. Reconciliation is provisioning work, not a health requirement:
 * new databases still receive it, and an operator can explicitly request it after a media
 * or catalogue migration with RECONCILE_CATALOG_ON_BOOT=true.
 */
export default async function ensureSeeded(args: ExecArgs) {
  const { container } = args;
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["token", "title"],
    filters: { type: "publishable", title: "FONEKIST" },
  });

  const token = keys?.[0]?.token;
  if (!token) {
    logger.info("FONEKIST catalog is not seeded; running the idempotent seed now.");
    await seed(args);
    await fetchPlaceholderPhotos(args);
  } else {
    logger.info("FONEKIST catalog is already seeded.");
    logger.info(`FONEKIST publishable key: ${token}`);

    if (process.env.RECONCILE_CATALOG_ON_BOOT === "true") {
      logger.info("Catalogue reconciliation requested for this boot.");
      await fetchPlaceholderPhotos(args);
    }
  }
}
