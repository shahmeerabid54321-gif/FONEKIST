import { describe, expect, it } from "vitest";
import {
  installmentDisclosure,
  installmentPlanSchema,
  installmentTotalIsConsistent,
  isPlanOfferable,
  type InstallmentPlan,
} from "./installments.js";

const plan: InstallmentPlan = {
  id: "iplan_1",
  variant_id: "variant_1",
  product_id: "prod_1",
  label: "12 months",
  advance_pkr: 90_000,
  monthly_pkr: 32_500,
  tenure_months: 12,
  total_payable_pkr: 480_000,
  cash_price_pkr: 424_999,
  active: true,
  active_from: null,
  active_until: null,
};

describe("installment arithmetic", () => {
  it("computes the total as advance plus monthly times tenure", () => {
    const disclosure = installmentDisclosure(plan);
    expect(disclosure.monthly_total_pkr).toBe(390_000);
    expect(disclosure.total_payable_pkr).toBe(480_000);
  });

  it("states the difference from cash in rupees and per cent", () => {
    // INST-004. This is the figure the reference sites omit, and omitting it is what makes
    // an installment offer feel like a trick once the payments start.
    const disclosure = installmentDisclosure(plan);
    expect(disclosure.difference_pkr).toBe(55_001);
    expect(disclosure.difference_percent).toBe(12.9);
  });

  it("stays in integer rupees with no float drift", () => {
    const odd = installmentDisclosure({
      advance_pkr: 33_333,
      monthly_pkr: 8_333,
      tenure_months: 18,
      cash_price_pkr: 160_000,
    });
    expect(Number.isInteger(odd.total_payable_pkr)).toBe(true);
    expect(Number.isInteger(odd.difference_pkr)).toBe(true);
    expect(odd.total_payable_pkr).toBe(33_333 + 8_333 * 18);
  });

  it("never advertises a plan as cheaper than cash", () => {
    // A negative difference is a data fault, not a bargain. Showing it would advertise a
    // saving that does not exist, which is exactly the fabricated-savings rule.
    const wrong = installmentDisclosure({
      advance_pkr: 10_000,
      monthly_pkr: 1_000,
      tenure_months: 3,
      cash_price_pkr: 100_000,
    });
    expect(wrong.difference_pkr).toBe(0);
    expect(wrong.difference_percent).toBe(0);
  });

  it("detects a stored total that disagrees with the arithmetic", () => {
    expect(installmentTotalIsConsistent(plan)).toBe(true);
    expect(installmentTotalIsConsistent({ ...plan, total_payable_pkr: 479_000 })).toBe(false);
  });
});

describe("plan validation", () => {
  it("rejects a plan with no monthly amount", () => {
    const result = installmentPlanSchema.safeParse({ ...plan, monthly_pkr: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects fractional rupees", () => {
    const result = installmentPlanSchema.safeParse({ ...plan, monthly_pkr: 32_500.5 });
    expect(result.success).toBe(false);
  });
});

describe("isPlanOfferable", () => {
  const now = new Date("2026-08-27T00:00:00Z");

  it("refuses an inactive plan", () => {
    expect(isPlanOfferable({ ...plan, active: false }, now)).toBe(false);
  });

  it("respects the active window at both ends", () => {
    expect(isPlanOfferable({ ...plan, active_from: new Date("2026-09-01T00:00:00Z") }, now)).toBe(false);
    expect(isPlanOfferable({ ...plan, active_until: new Date("2026-08-01T00:00:00Z") }, now)).toBe(false);
    expect(isPlanOfferable(plan, now)).toBe(true);
  });
});
