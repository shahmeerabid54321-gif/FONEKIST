import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { ExecArgs } from "@medusajs/framework/types";
import { INSTALLMENTS_MODULE } from "../modules/installments";
import type InstallmentsService from "../modules/installments/service";
import { VARIANT_PRICE_FIELDS, pkrPriceOf, type PricedVariant } from "../lib/variant-price";
import { reindexProducts } from "../lib/search-indexer";

/**
 * Rewrites every installment plan from the schedule currently in force (ADR-028).
 *
 * The seed cannot do this. It skips any variant that already has plans, deliberately, so
 * that re-seeding a working catalogue does not silently reprice offers people are looking
 * at. That makes it the wrong tool for the two cases this script exists for: rolling out a
 * change to the default schedule, and repricing after handsets have been repriced.
 *
 * It is a script rather than a subscriber on purpose. Price changes do not reliably arrive
 * as product events, and an offer that reprices itself because somebody edited a catalogue
 * field is exactly the silent change the disclosure rules exist to prevent. Regeneration is
 * an act with an author.
 */
export default async function regenerateInstallmentPlans({ container }: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const installments: InstallmentsService = container.resolve(INSTALLMENTS_MODULE);

  const { data } = await query.graph({
    entity: "product_variant",
    fields: [...VARIANT_PRICE_FIELDS],
  });

  const variants = (data ?? []) as unknown as PricedVariant[];
  logger.info(`Regenerating installment plans for ${variants.length} variant(s)...`);

  const totals = { created: 0, updated: 0, deactivated: 0, failed: 0 };
  const touched = new Set<string>();

  for (const variant of variants) {
    try {
      const result = await installments.regeneratePlansFor(
        variant.product_id,
        variant.id,
        pkrPriceOf(variant),
      );
      totals.created += result.created;
      totals.updated += result.updated;
      totals.deactivated += result.deactivated;
      if (result.created + result.updated + result.deactivated > 0) touched.add(variant.product_id);
    } catch (error) {
      // One bad variant must not abandon the rest of the catalogue half repriced.
      totals.failed += 1;
      logger.error(
        `Could not regenerate plans for variant ${variant.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  logger.info(
    `Plans: ${totals.created} created, ${totals.updated} updated, ${totals.deactivated} withdrawn, ${totals.failed} failed.`,
  );

  if (touched.size > 0) {
    // "From Rs X a month" on a card is served from the index, not from the plan table.
    const { indexed } = await reindexProducts(container, [...touched]);
    logger.info(`Reindexed ${indexed} product(s).`);
  }
}
