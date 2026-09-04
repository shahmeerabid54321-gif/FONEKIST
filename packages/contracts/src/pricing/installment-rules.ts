import { z } from "zod";
import { INSTALLMENT_TENURES } from "../schemas/installments.js";

/**
 * How an installment schedule is derived from a cash price. Source of truth: ADR-028,
 * which amends ADR-025.
 *
 * ADR-025 says there is no rate anywhere, and `installment_plan` still has none: the offer
 * a customer sees is a cash price, an advance, a monthly figure, a tenure and a total, all
 * in whole rupees. What lives here is the *authoring input* that produces those amounts —
 * the share of the price taken as an advance, and the markup added for deferring the rest.
 *
 * That is not an interest rate. It does not accrue, it is not annualised, and it is fixed
 * at the moment of sale: the offer is a deferred-payment sale of goods, not a loan. The
 * seeded schedule already carried these two fractions in code; this makes them persistent
 * and editable without moving them any closer to the customer.
 *
 * These figures must never cross the store boundary. This directory is deliberately absent
 * from the `FILES` allow-list in `scripts/sync-contracts.mjs`, so the FONEKIST storefront
 * cannot import a percentage even by accident, and no `/store/*` response may carry one.
 *
 * Percentages are integer basis points — 6000 is 60% — so a schedule can be tuned to a
 * tenth of a per cent without a float ever touching the arithmetic.
 */

/** An advance is a single counter payment. Rs 31,000 reads as an offer; Rs 31,247 reads as output. */
export const ADVANCE_ROUNDING_PKR = 1000;

/** The monthly figure is always rounded *up*, which is what keeps the total at or above cash. */
export const MONTHLY_ROUNDING_PKR = 100;

/**
 * The cheapest handset worth offering a plan on.
 *
 * Below this the paperwork, the review and the collection cost more than the margin, and
 * offering a plan on a Rs 30,000 handset mostly serves to make the store look like it
 * finances everything. It is enforced in the derivation rather than only at seed time, so
 * a hand-authored rule cannot route around it.
 */
export const MINIMUM_PLAN_PRICE_PKR = 40_000;

/**
 * The advance may not be the whole price.
 *
 * At 100% there is nothing left to pay in installments and the monthly figure derives to
 * zero, which is a plan that cannot exist rather than a plan that is very cheap.
 */
export const MAX_ADVANCE_BPS = 9_000;

/** A ceiling on the markup, so a typo cannot quietly double the price of a phone. */
export const MAX_MARKUP_BPS = 20_000;

export const INSTALLMENT_RULE_SCOPES = ["global", "product", "variant"] as const;
export type InstallmentRuleScope = (typeof INSTALLMENT_RULE_SCOPES)[number];

export const installmentRuleSchema = z.object({
  tenure_months: z
    .number()
    .int()
    .refine(
      (value) => (INSTALLMENT_TENURES as readonly number[]).includes(value),
      `Tenure must be one of ${INSTALLMENT_TENURES.join(", ")} months.`,
    ),
  /** Share of the cash price taken up front, in basis points. */
  advance_bps: z
    .number()
    .int()
    .min(0)
    .max(
      MAX_ADVANCE_BPS,
      "An advance cannot be the whole cash price; there would be nothing to pay in installments.",
    ),
  /** How much is added to the cash price for deferring payment, in basis points. Never a rate. */
  markup_bps: z.number().int().min(0).max(MAX_MARKUP_BPS),
  active: z.boolean(),
});
export type InstallmentRule = z.infer<typeof installmentRuleSchema>;

/**
 * The schedule every item is offered on unless somebody has overridden it.
 *
 * 3 months costs the least because most of the price is paid up front; 12 months costs the
 * most because the least is. The customer is shown the resulting difference in rupees and
 * per cent before they can apply (INST-004), which is the only form in which any of this
 * reaches them.
 */
export const DEFAULT_INSTALLMENT_RULES: readonly InstallmentRule[] = [
  { tenure_months: 3, advance_bps: 6_000, markup_bps: 2_000, active: true },
  { tenure_months: 6, advance_bps: 5_000, markup_bps: 3_000, active: true },
  { tenure_months: 9, advance_bps: 4_000, markup_bps: 4_000, active: true },
  { tenure_months: 12, advance_bps: 2_500, markup_bps: 5_000, active: true },
];

export interface DerivedPlan {
  label: string;
  advance_pkr: number;
  monthly_pkr: number;
  tenure_months: number;
  total_payable_pkr: number;
  cash_price_pkr: number;
  sort_order: number;
}

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;
const ceilTo = (value: number, step: number): number => Math.ceil(value / step) * step;

/**
 * Builds one plan from one rule and one cash price. Returns null for an inactive rule.
 *
 * Two properties matter and are enforced by the order of operations rather than hoped for:
 *
 *  - **Every amount is a whole rupee.** PKR is presented without decimals, and a fractional
 *    monthly figure becomes a customer paying one rupee more than the page promised on the
 *    last month of a twelve-month plan.
 *  - **The total is never below the cash price.** Because the monthly figure is rounded up,
 *    `monthly * tenure >= financed`, so
 *    `total = advance + monthly * tenure >= advance + (cash - advance) + markup = cash + markup`.
 *
 *    That telescope only closes if `financed` is computed from the **rounded** advance. Take
 *    the rounded advance out of an unrounded remainder and the two no longer cancel: with a
 *    zero markup and an advance that rounded down, the total can land below cash and the
 *    page would advertise a saving that does not exist. Round the advance first.
 *
 * The stated total is then recomputed from the rounded parts, so `advance + monthly x
 * tenure` is exactly the number shown. It is never the pre-rounding target.
 */
export function deriveInstallmentPlan(
  cashPricePkr: number,
  rule: InstallmentRule,
  sortOrder = 0,
): DerivedPlan | null {
  if (!rule.active) return null;

  if (!Number.isInteger(cashPricePkr) || cashPricePkr < MINIMUM_PLAN_PRICE_PKR) {
    throw new Error(
      `An installment plan needs a whole-rupee cash price of at least Rs ${MINIMUM_PLAN_PRICE_PKR}.`,
    );
  }

  const advance = roundTo((cashPricePkr * rule.advance_bps) / 10_000, ADVANCE_ROUNDING_PKR);
  const markup = Math.round((cashPricePkr * rule.markup_bps) / 10_000);
  // From the rounded advance. See the telescope above.
  const financed = cashPricePkr - advance + markup;
  const monthly = ceilTo(financed / rule.tenure_months, MONTHLY_ROUNDING_PKR);

  if (advance <= 0 || monthly <= 0) {
    throw new Error(
      `A ${rule.tenure_months} month plan on Rs ${cashPricePkr} derives an advance of Rs ${advance} and Rs ${monthly} a month, which is not an offer.`,
    );
  }

  return {
    label: `${rule.tenure_months} months`,
    advance_pkr: advance,
    monthly_pkr: monthly,
    tenure_months: rule.tenure_months,
    total_payable_pkr: advance + monthly * rule.tenure_months,
    cash_price_pkr: cashPricePkr,
    sort_order: sortOrder,
  };
}

/**
 * The schedule in force for one variant.
 *
 * Resolution is **per tenure**, not per set: a variant override of the 12 month tenure must
 * not silently discard a product-scope override of the 3, 6 and 9 month ones. Narrowest
 * scope wins for each tenure independently — variant, then product, then a stored global,
 * then the built-in default.
 *
 * Absence and disablement are different answers. No row at a scope means "inherit"; a row
 * with `active: false` means "this tenure is not offered here", and a narrower scope can
 * still turn it back on. A rule always carries both percentages, so there is no partial
 * override to merge and no three-way arithmetic to get wrong.
 */
export function resolveInstallmentRules(overrides: {
  global?: readonly InstallmentRule[];
  product?: readonly InstallmentRule[];
  variant?: readonly InstallmentRule[];
}): InstallmentRule[] {
  const byTenure = (rules: readonly InstallmentRule[] | undefined): Map<number, InstallmentRule> =>
    new Map((rules ?? []).map((rule) => [rule.tenure_months, rule]));

  const variant = byTenure(overrides.variant);
  const product = byTenure(overrides.product);
  const global = byTenure(overrides.global);
  const defaults = byTenure(DEFAULT_INSTALLMENT_RULES);

  // Every tenure the contract knows about is returned, inactive ones included, so a caller
  // can render "not offered" rather than having to infer it from an absence. The tenures
  // with no built-in default are off unless somebody has turned them on.
  return INSTALLMENT_TENURES.map(
    (tenure) =>
      variant.get(tenure) ??
      product.get(tenure) ??
      global.get(tenure) ??
      defaults.get(tenure) ?? {
        tenure_months: tenure,
        advance_bps: 0,
        markup_bps: 0,
        active: false,
      },
  );
}

/** Derives the whole schedule for a cash price, skipping the tenures that are switched off. */
export function deriveInstallmentPlans(
  cashPricePkr: number,
  rules: readonly InstallmentRule[],
): DerivedPlan[] {
  return rules
    .map((rule, index) => deriveInstallmentPlan(cashPricePkr, rule, index))
    .filter((plan): plan is DerivedPlan => plan !== null);
}

/* POST /admin/installments/rules */
export const installmentRulesUpsertSchema = z
  .object({
    scope: z.enum(INSTALLMENT_RULE_SCOPES),
    /** Null for the global schedule; a product id or a variant id otherwise. */
    scope_id: z.string().min(1).nullable(),
    rules: z.array(installmentRuleSchema).min(1).max(INSTALLMENT_TENURES.length),
  })
  .refine(
    (value) => (value.scope === "global") === (value.scope_id === null),
    "The global schedule takes no id, and a product or variant schedule requires one.",
  )
  .refine(
    (value) => new Set(value.rules.map((rule) => rule.tenure_months)).size === value.rules.length,
    "A tenure may only appear once in a schedule.",
  );
export type InstallmentRulesUpsert = z.infer<typeof installmentRulesUpsertSchema>;

/*
 * POST /admin/installments/rules/preview
 *
 * Takes real variants, ad-hoc cash prices, or both. The ad-hoc form exists so the screen
 * that edits the *default* schedule can price it against a sample handset without the
 * browser ever running the arithmetic itself: there is one derivation, it lives here, and
 * an admin preview is held to it exactly as a customer-facing plan is.
 */
export const installmentRulesPreviewSchema = z
  .object({
    variant_ids: z.array(z.string().min(1)).max(50).default([]),
    cash_prices_pkr: z.array(z.number().int().positive()).max(10).default([]),
    rules: z.array(installmentRuleSchema).min(1).max(INSTALLMENT_TENURES.length),
  })
  .refine(
    (value) => value.variant_ids.length > 0 || value.cash_prices_pkr.length > 0,
    "Give a variant or a cash price to price the schedule against.",
  );
export type InstallmentRulesPreview = z.infer<typeof installmentRulesPreviewSchema>;
