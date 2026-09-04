import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  MINIMUM_PLAN_PRICE_PKR,
  deriveInstallmentPlans,
  installmentDisclosure,
  installmentRulesPreviewSchema,
} from "@pk/contracts";
import { fail, ok, requestIdOf } from "../../../../../lib/http";
import { VARIANT_PRICE_FIELDS, pkrPriceOf, type PricedVariant } from "../../../../../lib/variant-price";

/**
 * POST /admin/installments/rules/preview
 *
 * What a schedule would actually cost, before anybody saves it.
 *
 * It returns the full disclosure for each tenure — including the difference from cash in
 * rupees and per cent — rather than echoing back the shares that were sent in. That is the
 * point of the screen: the monthly figure is rounded up to the nearest hundred, so a
 * schedule set to 50% shows the customer 50.4% on one price and 51.1% on another, and the
 * person setting it should be looking at the number the customer will see (INST-004).
 *
 * Nothing is written. Admin routes are authenticated by Medusa's admin middleware (SEC-002).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse): Promise<void> {
  const requestId = requestIdOf(req);

  try {
    const parsed = installmentRulesPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        fail(
          {
            code: "VALIDATION_ERROR",
            message: "That schedule cannot be priced as written.",
            field_errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
          },
          requestId,
        ),
      );
      return;
    }

    const priceAt = (cashPricePkr: number) =>
      cashPricePkr < MINIMUM_PLAN_PRICE_PKR
        ? { cash_price_pkr: cashPricePkr, below_minimum: true, plans: [] }
        : {
            cash_price_pkr: cashPricePkr,
            below_minimum: false,
            plans: deriveInstallmentPlans(cashPricePkr, parsed.data.rules).map((plan) => ({
              label: plan.label,
              ...installmentDisclosure(plan),
            })),
          };

    let variants: ({ variant_id: string; title: string } & ReturnType<typeof priceAt>)[] = [];

    if (parsed.data.variant_ids.length > 0) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
      const { data } = await query.graph({
        entity: "product_variant",
        fields: [...VARIANT_PRICE_FIELDS, "title"],
        filters: { id: parsed.data.variant_ids },
      });

      variants = ((data ?? []) as unknown as PricedVariant[]).map((variant) => ({
        variant_id: variant.id,
        title: variant.title ?? "",
        ...priceAt(pkrPriceOf(variant)),
      }));
    }

    // Ad-hoc prices, for the screen that edits the default schedule and has no variant.
    const prices = parsed.data.cash_prices_pkr.map(priceAt);

    res.json(ok({ variants, prices, minimum_plan_price_pkr: MINIMUM_PLAN_PRICE_PKR }, requestId));
  } catch (error) {
    const { status, body } = fail(error, requestId, true);
    res.status(status).json(body);
  }
}
