import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import fetchPlaceholderPhotos from "./fetch-placeholder-photos";
import seed from "./seed";

/**
 * Seeds a new deployment once, while keeping free-instance cold starts quick afterwards.
 * The publishable key is logged on every boot so the storefront service can be configured
 * from Render without enabling the Medusa admin UI.
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
  } else {
    logger.info("FONEKIST catalog is already seeded.");
    logger.info(`FONEKIST publishable key: ${token}`);
  }

  // The seed creates catalog records, while the photographs are static storefront assets.
  // Link those paths after seeding (and repair an older deployment that was seeded before
  // this step existed), then refresh the derived search documents used by listing cards.
  await fetchPlaceholderPhotos(args);
}
