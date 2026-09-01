import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

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
    return;
  }

  logger.info("FONEKIST catalog is already seeded.");
  logger.info(`FONEKIST publishable key: ${token}`);
}
