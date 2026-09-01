/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/schemas/installments.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

import { z } from "zod";
import { pkrAmountSchema } from "./pakistan";

/**
 * Installment offers. Source of truth: ADR-023, ADR-025, requirements INST-001..INST-010.
 *
 * The offer is structured as a **deferred-payment sale of goods**, not a loan: there is a
 * cash price and an installment price, and the difference between them is disclosed in
 * rupees. There is no interest rate anywhere in this file, and none should be added. A
 * markup rate expressed as a rate is a lending product, which is regulated differently.
 *
 * Every amount is an integer number of rupees. PKR is presented without decimals and the
 * arithmetic must be exact: a float here becomes a customer paying Rs 1 more than the page
 * promised on the last month of a 12-month plan.
 */

export const INSTALLMENT_TENURES = [3, 6, 9, 12, 18, 24] as const;
export type InstallmentTenure = (typeof INSTALLMENT_TENURES)[number];

export const installmentPlanSchema = z.object({
  id: z.string(),
  /** Plans are priced against a specific variant: storage changes the price and the plan. */
  variant_id: z.string().min(1),
  product_id: z.string().min(1),
  /** Short customer-facing name, e.g. "12 months". Never a rate. */
  label: z.string().min(1),
  advance_pkr: pkrAmountSchema,
  monthly_pkr: pkrAmountSchema.refine((value) => value > 0, "A plan must have a monthly amount."),
  tenure_months: z.number().int().positive().max(36),
  /** Denormalised so a customer and an auditor read the same number, not two derivations. */
  total_payable_pkr: pkrAmountSchema,
  /** The cash price the plan was authored against, snapshotted for the disclosure. */
  cash_price_pkr: pkrAmountSchema,
  active: z.boolean(),
  active_from: z.coerce.date().nullable(),
  active_until: z.coerce.date().nullable(),
});
export type InstallmentPlan = z.infer<typeof installmentPlanSchema>;

/**
 * What the customer must be shown before applying (INST-004).
 *
 * Every field is a rupee figure or a plain count. `difference_pkr` and `difference_percent`
 * are the two the reference sites omit, and omitting them is exactly what makes an
 * installment offer feel like a trick once the payments start.
 */
export interface InstallmentDisclosure {
  cash_price_pkr: number;
  advance_pkr: number;
  monthly_pkr: number;
  tenure_months: number;
  /** monthly_pkr * tenure_months, stated separately so the arithmetic is visible. */
  monthly_total_pkr: number;
  total_payable_pkr: number;
  /** total_payable_pkr - cash_price_pkr. Zero when the plan costs no more than cash. */
  difference_pkr: number;
  /** The same difference relative to the cash price, to one decimal place. */
  difference_percent: number;
}

/**
 * Computes the disclosure from a plan.
 *
 * The total is recomputed rather than trusted, and callers compare it against the stored
 * `total_payable_pkr`: a stored total that disagrees with the arithmetic is a data fault,
 * and the customer must never be the one who discovers it.
 */
export function installmentDisclosure(
  plan: Pick<
    InstallmentPlan,
    "advance_pkr" | "monthly_pkr" | "tenure_months" | "cash_price_pkr"
  >,
  cashPricePkr?: number,
): InstallmentDisclosure {
  const cash = cashPricePkr ?? plan.cash_price_pkr;
  const monthlyTotal = plan.monthly_pkr * plan.tenure_months;
  const total = plan.advance_pkr + monthlyTotal;
  const difference = total - cash;

  return {
    cash_price_pkr: cash,
    advance_pkr: plan.advance_pkr,
    monthly_pkr: plan.monthly_pkr,
    tenure_months: plan.tenure_months,
    monthly_total_pkr: monthlyTotal,
    total_payable_pkr: total,
    // A plan that costs less than cash is a data error, not a bargain to advertise.
    difference_pkr: Math.max(0, difference),
    difference_percent: cash > 0 ? Math.round((Math.max(0, difference) / cash) * 1000) / 10 : 0,
  };
}

/** True when the stored total matches the arithmetic. Used by validation and by tests. */
export function installmentTotalIsConsistent(plan: InstallmentPlan): boolean {
  return plan.total_payable_pkr === plan.advance_pkr + plan.monthly_pkr * plan.tenure_months;
}

/** Whether a plan may be offered right now. */
export function isPlanOfferable(plan: InstallmentPlan, now: Date = new Date()): boolean {
  if (!plan.active) return false;
  if (plan.active_from && now < plan.active_from) return false;
  if (plan.active_until && now > plan.active_until) return false;
  return true;
}

/**
 * The plan snapshot written onto an order (INST-006).
 *
 * Mirrors the warranty snapshot rule (WAR-001): the terms agreed at purchase are recorded
 * on the order and never re-read from the catalogue, so editing a plan cannot rewrite what
 * somebody already agreed to.
 */
export const installmentSnapshotSchema = z.object({
  plan_id: z.string(),
  label: z.string(),
  advance_pkr: pkrAmountSchema,
  monthly_pkr: pkrAmountSchema,
  tenure_months: z.number().int().positive(),
  total_payable_pkr: pkrAmountSchema,
  cash_price_pkr: pkrAmountSchema,
  difference_pkr: pkrAmountSchema,
  /** Version of the consent and disclosure text the customer actually saw. */
  terms_version: z.string(),
  snapshotted_at: z.string().datetime(),
});
export type InstallmentSnapshot = z.infer<typeof installmentSnapshotSchema>;
