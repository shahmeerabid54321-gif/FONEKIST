import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSTALLMENT_RULES,
  MINIMUM_PLAN_PRICE_PKR,
  deriveInstallmentPlan,
  deriveInstallmentPlans,
  installmentRuleSchema,
  installmentRulesUpsertSchema,
  resolveInstallmentRules,
  type InstallmentRule,
} from "./installment-rules.js";

const rule = (overrides: Partial<InstallmentRule> = {}): InstallmentRule => ({
  tenure_months: 12,
  advance_bps: 2_500,
  markup_bps: 5_000,
  active: true,
  ...overrides,
});

describe("deriveInstallmentPlan", () => {
  it("derives the agreed default schedule for a Rs 120,000 handset", () => {
    expect(deriveInstallmentPlans(120_000, DEFAULT_INSTALLMENT_RULES)).toEqual([
      {
        label: "3 months",
        advance_pkr: 72_000,
        monthly_pkr: 24_000,
        tenure_months: 3,
        total_payable_pkr: 144_000,
        cash_price_pkr: 120_000,
        sort_order: 0,
      },
      {
        label: "6 months",
        advance_pkr: 60_000,
        monthly_pkr: 16_000,
        tenure_months: 6,
        total_payable_pkr: 156_000,
        cash_price_pkr: 120_000,
        sort_order: 1,
      },
      {
        label: "9 months",
        advance_pkr: 48_000,
        monthly_pkr: 13_400,
        tenure_months: 9,
        total_payable_pkr: 168_600,
        cash_price_pkr: 120_000,
        sort_order: 2,
      },
      {
        label: "12 months",
        advance_pkr: 30_000,
        monthly_pkr: 12_500,
        tenure_months: 12,
        total_payable_pkr: 180_000,
        cash_price_pkr: 120_000,
        sort_order: 3,
      },
    ]);
  });

  it("holds every invariant across the price range the catalogue covers", () => {
    // Swept rather than sampled: the rounding interacts with the price, and a spot check
    // would miss the one price where an advance rounds down into a total below cash.
    for (let cash = MINIMUM_PLAN_PRICE_PKR; cash <= 800_000; cash += 137) {
      const plans = deriveInstallmentPlans(cash, DEFAULT_INSTALLMENT_RULES);
      expect(plans).toHaveLength(4);

      let previousTotal = 0;
      for (const plan of plans) {
        expect(Number.isInteger(plan.advance_pkr)).toBe(true);
        expect(Number.isInteger(plan.monthly_pkr)).toBe(true);
        expect(plan.advance_pkr).toBeGreaterThan(0);
        expect(plan.monthly_pkr).toBeGreaterThan(0);
        expect(plan.total_payable_pkr).toBe(plan.advance_pkr + plan.monthly_pkr * plan.tenure_months);
        expect(plan.total_payable_pkr).toBeGreaterThanOrEqual(cash);
        // A longer tenure always costs more in total. Otherwise a customer paying for
        // longer would be paying less, and the schedule would make no sense to read.
        expect(plan.total_payable_pkr).toBeGreaterThan(previousTotal);
        previousTotal = plan.total_payable_pkr;
      }
    }
  });

  it("holds at the awkward prices the seeded catalogue actually contains", () => {
    for (const cash of [40_000, 40_001, 46_999, 99_999, 124_999, 424_999]) {
      for (const plan of deriveInstallmentPlans(cash, DEFAULT_INSTALLMENT_RULES)) {
        expect(plan.total_payable_pkr).toBe(plan.advance_pkr + plan.monthly_pkr * plan.tenure_months);
        expect(plan.total_payable_pkr).toBeGreaterThanOrEqual(cash);
      }
    }
  });

  it("totals exactly the cash price when nothing is added for deferring", () => {
    const plan = deriveInstallmentPlan(120_000, rule({ markup_bps: 0 }));
    expect(plan?.total_payable_pkr).toBe(120_000);
  });

  it("returns null for a tenure that is switched off", () => {
    expect(deriveInstallmentPlan(120_000, rule({ active: false }))).toBeNull();
  });

  it("refuses a price below the minimum rather than quoting a plan nobody should offer", () => {
    expect(() => deriveInstallmentPlan(MINIMUM_PLAN_PRICE_PKR - 1, rule())).toThrow(/at least/);
  });

  it("refuses a fractional cash price", () => {
    expect(() => deriveInstallmentPlan(120_000.5, rule())).toThrow(/whole-rupee/);
  });
});

describe("installmentRuleSchema", () => {
  it("rejects an advance that leaves nothing to pay in installments", () => {
    expect(installmentRuleSchema.safeParse(rule({ advance_bps: 10_000 })).success).toBe(false);
  });

  it("rejects a tenure the contract does not offer", () => {
    expect(installmentRuleSchema.safeParse(rule({ tenure_months: 7 })).success).toBe(false);
  });

  it("rejects a fractional basis point", () => {
    expect(installmentRuleSchema.safeParse(rule({ markup_bps: 2_000.5 })).success).toBe(false);
  });
});

describe("installmentRulesUpsertSchema", () => {
  it("rejects the same tenure twice", () => {
    const parsed = installmentRulesUpsertSchema.safeParse({
      scope: "product",
      scope_id: "prod_1",
      rules: [rule({ tenure_months: 3 }), rule({ tenure_months: 3 })],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a global schedule carrying an id, and a product schedule without one", () => {
    expect(
      installmentRulesUpsertSchema.safeParse({ scope: "global", scope_id: "prod_1", rules: [rule()] })
        .success,
    ).toBe(false);
    expect(
      installmentRulesUpsertSchema.safeParse({ scope: "product", scope_id: null, rules: [rule()] })
        .success,
    ).toBe(false);
  });
});

describe("resolveInstallmentRules", () => {
  const find = (rules: InstallmentRule[], tenure: number): InstallmentRule =>
    rules.find((entry) => entry.tenure_months === tenure)!;

  it("falls back to the built-in defaults when nothing is overridden", () => {
    const resolved = resolveInstallmentRules({});
    expect(find(resolved, 3)).toEqual(DEFAULT_INSTALLMENT_RULES[0]);
    expect(find(resolved, 12)).toEqual(DEFAULT_INSTALLMENT_RULES[3]);
    // Tenures with no default are known but not offered.
    expect(find(resolved, 24).active).toBe(false);
  });

  it("overrides one tenure without disturbing the others", () => {
    const resolved = resolveInstallmentRules({
      product: [rule({ tenure_months: 12, advance_bps: 3_000, markup_bps: 4_000 })],
    });
    expect(find(resolved, 12).advance_bps).toBe(3_000);
    expect(find(resolved, 3)).toEqual(DEFAULT_INSTALLMENT_RULES[0]);
  });

  it("lets a variant re-enable a tenure the product disabled", () => {
    const resolved = resolveInstallmentRules({
      product: [rule({ tenure_months: 12, active: false })],
      variant: [rule({ tenure_months: 12, active: true, advance_bps: 2_000 })],
    });
    expect(find(resolved, 12).active).toBe(true);
    expect(find(resolved, 12).advance_bps).toBe(2_000);
  });

  it("applies the narrowest scope per tenure", () => {
    const resolved = resolveInstallmentRules({
      global: [rule({ tenure_months: 3, advance_bps: 1_000 }), rule({ tenure_months: 6, advance_bps: 1_100 })],
      product: [rule({ tenure_months: 6, advance_bps: 2_200 })],
      variant: [rule({ tenure_months: 9, advance_bps: 3_300 })],
    });
    expect(find(resolved, 3).advance_bps).toBe(1_000);
    expect(find(resolved, 6).advance_bps).toBe(2_200);
    expect(find(resolved, 9).advance_bps).toBe(3_300);
    expect(find(resolved, 12)).toEqual(DEFAULT_INSTALLMENT_RULES[3]);
  });
});
