/**
 * How the seeded installment plans are priced.
 *
 * The offer is a **deferred-payment sale of goods**, not a loan (ADR-025). So the schedule
 * below is expressed as the difference between the cash price and the installment price,
 * and that difference is what the customer is shown, in rupees. It is deliberately not
 * called a rate: describing it as one would describe a regulated lending product, which
 * this is not, and it would also be misleading, because the figure is not annualised.
 *
 * Real plans are authored by whoever underwrites them. This exists so a seeded catalogue
 * has coherent, arithmetically exact plans to develop and test against.
 */

export interface PlanShape {
  tenure_months: number;
  /** How much more than the cash price this tenure costs, as a fraction. */
  uplift: number;
  /** Advance as a fraction of the cash price. */
  advance_fraction: number;
}

export const PLAN_SHAPES: PlanShape[] = [
  { tenure_months: 3, uplift: 0.04, advance_fraction: 0.35 },
  { tenure_months: 6, uplift: 0.09, advance_fraction: 0.3 },
  { tenure_months: 9, uplift: 0.14, advance_fraction: 0.25 },
  { tenure_months: 12, uplift: 0.19, advance_fraction: 0.25 },
];

export interface GeneratedPlan {
  label: string;
  advance_pkr: number;
  monthly_pkr: number;
  tenure_months: number;
  total_payable_pkr: number;
  cash_price_pkr: number;
  sort_order: number;
}

/**
 * Builds the plans for one cash price.
 *
 * Two properties matter and are both enforced by rounding rather than hoped for:
 *
 *  - **Every amount is a whole rupee.** PKR is presented without decimals, and a fractional
 *    monthly figure becomes a customer paying one rupee more than the page promised on the
 *    last month of a twelve-month plan.
 *  - **The total is always at least the cash price.** The monthly figure is rounded *up* to
 *    the nearest hundred, so the arithmetic can only ever move the total away from the cash
 *    price, never below it. A plan that totalled less than cash would advertise a saving
 *    that does not exist.
 *
 * The stated total is then recomputed from the rounded parts, so `advance + monthly x
 * tenure` is exactly the number shown. It is never the pre-rounding target.
 */
export function generatePlans(cashPricePkr: number): GeneratedPlan[] {
  return PLAN_SHAPES.map((shape, index) => {
    const advance = Math.round((cashPricePkr * shape.advance_fraction) / 1000) * 1000;
    const target = Math.round(cashPricePkr * (1 + shape.uplift));
    const monthly = Math.ceil((target - advance) / shape.tenure_months / 100) * 100;
    const total = advance + monthly * shape.tenure_months;

    return {
      label: `${shape.tenure_months} months`,
      advance_pkr: advance,
      monthly_pkr: monthly,
      tenure_months: shape.tenure_months,
      total_payable_pkr: total,
      cash_price_pkr: cashPricePkr,
      sort_order: index,
    };
  });
}

/**
 * The cheapest handset worth offering a plan on.
 *
 * Below this the paperwork, the review and the collection cost more than the margin, and
 * offering a plan on a Rs 30,000 handset mostly serves to make the store look like it
 * finances everything.
 */
export const MINIMUM_PLAN_PRICE_PKR = 40_000;
