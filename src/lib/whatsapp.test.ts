import { describe, expect, it } from "vitest";
import type { PlanView } from "./installments";
import { applicationMessage, whatsappNumber } from "./whatsapp";

const plan: PlanView = {
  id: "plan_12",
  label: "12 months",
  variant_id: "variant_1",
  cash_price_pkr: 100_000,
  advance_pkr: 25_000,
  monthly_pkr: 8_500,
  tenure_months: 12,
  monthly_total_pkr: 102_000,
  total_payable_pkr: 127_000,
  difference_pkr: 27_000,
  difference_percent: 27,
};

describe("whatsappNumber", () => {
  it("strips formatting to the digits wa.me wants", () => {
    expect(whatsappNumber("+92 300 1234567")).toBe("923001234567");
    expect(whatsappNumber("0092-300-1234567")).toBe("923001234567");
  });

  it("returns null when nothing usable is configured, so no button renders", () => {
    expect(whatsappNumber("")).toBeNull();
    expect(whatsappNumber("call us")).toBeNull();
    expect(whatsappNumber("111-222")).toBeNull();
  });
});

describe("applicationMessage", () => {
  const message = applicationMessage("FK-1A2B3C4D", plan);

  it("carries the reference", () => {
    expect(message).toContain("FK-1A2B3C4D");
  });

  /*
   * The rule this file exists to keep. A CNIC lives in one table (ADR-024), so the builder
   * is given the reference and the plan and has no identity data in scope at all. This
   * asserts the outcome rather than the argument list, because the argument list is the
   * thing a future edit would widen.
   */
  it("never carries anything CNIC shaped", () => {
    expect(message).not.toMatch(/\d{5}-\d{7}-\d/);
    expect(message).not.toMatch(/\d{13}/);
  });

  it("never states a monthly figure without its total (INST-003)", () => {
    expect(message).toContain("8,500");
    expect(message).toContain("x 12");
    expect(message).toContain("127,000");
    expect(message).toContain("more than the cash price");
  });

  it("uses no dash that customer-visible copy forbids", () => {
    expect(message).not.toMatch(/[–—]/);
  });
});
