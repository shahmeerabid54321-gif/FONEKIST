import { DEFAULT_INSTALLMENT_RULES, deriveInstallmentPlans } from "@pk/contracts";

/**
 * How the seeded installment plans are priced.
 *
 * The offer is a **deferred-payment sale of goods**, not a loan (ADR-025). So the schedule
 * is expressed as the difference between the cash price and the installment price, and that
 * difference is what the customer is shown, in rupees. It is deliberately not called a rate:
 * describing it as one would describe a regulated lending product, which this is not, and it
 * would also be misleading, because the figure is not annualised.
 *
 * The arithmetic used to live here. It now lives in `@pk/contracts` (ADR-028), because the
 * same derivation has to serve the seed, the admin screens that retune a schedule, and the
 * regeneration that rewrites plans afterwards. A second copy here would be a second answer
 * to the question of what a handset costs on a plan.
 */

export type { DerivedPlan as GeneratedPlan } from "@pk/contracts";
export { MINIMUM_PLAN_PRICE_PKR } from "@pk/contracts";

/** Builds the default schedule for one cash price. */
export function generatePlans(cashPricePkr: number) {
  return deriveInstallmentPlans(cashPricePkr, DEFAULT_INSTALLMENT_RULES);
}
