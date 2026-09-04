/**
 * The one definition of a variant's cash price in rupees.
 *
 * There are three prices in play around an installment plan and they are not the same
 * number: this one, the raw price set on the variant; `Number(cart.total)`, which the
 * application route recomputes the disclosure against so a customer is quoted the plan they
 * can actually have; and `installment_plan.cash_price_pkr`, the snapshot the plan was
 * authored against. Conflating them is how a card and a PDP end up advertising different
 * arithmetic, so anything that authors or previews a plan reads it from here.
 *
 * Deliberately the price set, not `calculated_price`. A calculated price resolves price
 * lists, customer groups and a region context; a plan is authored against the shelf price
 * of the handset, and an admin screen has no customer whose context it could resolve.
 */

export const VARIANT_PRICE_FIELDS = [
  "id",
  "product_id",
  "prices.amount",
  "prices.currency_code",
] as const;

/**
 * A variant as `query.graph` returns it under `VARIANT_PRICE_FIELDS`. Declared here rather
 * than at each call site because Medusa's generated `ProductVariant` type does not describe
 * a field-selected row, so every caller would otherwise invent its own cast.
 */
export interface PricedVariant {
  id: string;
  product_id: string;
  title?: string;
  prices: { amount: number; currency_code: string }[];
}

export function pkrPriceOf(variant: Pick<PricedVariant, "prices">): number {
  const price = variant.prices.find((entry) => entry.currency_code.toLowerCase() === "pkr");
  return price?.amount ?? 0;
}
