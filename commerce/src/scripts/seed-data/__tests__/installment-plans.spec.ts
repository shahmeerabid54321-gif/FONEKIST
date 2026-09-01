import { generatePlans } from "../installment-plans";

describe("generatePlans", () => {
  const plans = generatePlans(124_999);

  it("produces whole rupees everywhere", () => {
    for (const plan of plans) {
      expect(Number.isInteger(plan.advance_pkr)).toBe(true);
      expect(Number.isInteger(plan.monthly_pkr)).toBe(true);
      expect(Number.isInteger(plan.total_payable_pkr)).toBe(true);
    }
  });

  it("states a total that equals its own arithmetic", () => {
    // The failure this guards against is a stated total computed from the pre-rounding
    // target while the customer pays the rounded monthly figure.
    for (const plan of plans) {
      expect(plan.total_payable_pkr).toBe(plan.advance_pkr + plan.monthly_pkr * plan.tenure_months);
    }
  });

  it("never totals less than the cash price", () => {
    for (const plan of plans) {
      expect(plan.total_payable_pkr).toBeGreaterThanOrEqual(plan.cash_price_pkr);
    }
  });

  it("costs more the longer it runs", () => {
    const totals = plans.map((plan) => plan.total_payable_pkr);
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i]!).toBeGreaterThan(totals[i - 1]!);
    }
  });

  it("holds at awkward prices too", () => {
    // A price that divides badly is where rounding bugs live.
    for (const price of [40_001, 46_999, 99_999, 424_999]) {
      for (const plan of generatePlans(price)) {
        expect(plan.total_payable_pkr).toBe(plan.advance_pkr + plan.monthly_pkr * plan.tenure_months);
        expect(plan.total_payable_pkr).toBeGreaterThanOrEqual(price);
      }
    }
  });
});
