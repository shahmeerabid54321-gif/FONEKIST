import { describe, expect, it } from "vitest";
import { cheapestMonthly, isArithmeticallySound, type PlanView } from "./installments";

const plan: PlanView = {
  id: "iplan_1",
  label: "12 months",
  variant_id: "variant_1",
  cash_price_pkr: 124_999,
  advance_pkr: 31_000,
  monthly_pkr: 10_400,
  tenure_months: 12,
  monthly_total_pkr: 124_800,
  total_payable_pkr: 155_800,
  difference_pkr: 30_801,
  difference_percent: 24.6,
};

describe("isArithmeticallySound", () => {
  it("accepts a plan whose parts add up to its stated total", () => {
    expect(isArithmeticallySound(plan)).toBe(true);
  });

  it("refuses a plan whose total disagrees with its own parts", () => {
    // The customer must never be the person who discovers that the total printed beside a
    // plan is not what the plan actually costs.
    expect(isArithmeticallySound({ ...plan, total_payable_pkr: 150_000 })).toBe(false);
  });

  it("refuses a plan whose monthly subtotal disagrees", () => {
    expect(isArithmeticallySound({ ...plan, monthly_total_pkr: 120_000 })).toBe(false);
  });

  it("refuses fractional rupees", () => {
    // PKR is presented without decimals. A fractional monthly figure becomes a customer
    // paying a rupee more than the page promised in the final month.
    expect(isArithmeticallySound({ ...plan, monthly_pkr: 10_400.5 })).toBe(false);
    expect(isArithmeticallySound({ ...plan, advance_pkr: 31_000.25 })).toBe(false);
  });

  it("refuses a plan with no monthly payment", () => {
    expect(isArithmeticallySound({ ...plan, monthly_pkr: 0 })).toBe(false);
  });

  it("refuses a plan that totals less than the cash price", () => {
    // That would advertise a saving that does not exist.
    expect(
      isArithmeticallySound({
        ...plan,
        cash_price_pkr: 200_000,
      }),
    ).toBe(false);
  });
});

describe("cheapestMonthly", () => {
  it("picks the lowest monthly figure", () => {
    const cheaper: PlanView = { ...plan, id: "iplan_2", monthly_pkr: 8_000 };
    expect(cheapestMonthly([plan, cheaper])?.id).toBe("iplan_2");
  });

  it("returns null when there are no plans", () => {
    expect(cheapestMonthly([])).toBeNull();
  });
});
