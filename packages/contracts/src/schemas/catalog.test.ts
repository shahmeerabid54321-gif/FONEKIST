import { describe, expect, it } from "vitest";
import { warrantyLabel } from "./catalog.js";

describe("warrantyLabel", () => {
  const policy = (overrides: Partial<Parameters<typeof warrantyLabel>[0]> = {}) => ({
    type: "manufacturer" as const,
    duration_value: 1,
    duration_unit: "year" as const,
    provider_name: null,
    ...overrides,
  });

  it("matches the wording the UX spec gives as the good example", () => {
    expect(warrantyLabel(policy())).toBe("1-year manufacturer warranty");
  });

  it("keeps the unit singular in the compound adjective form", () => {
    // "2-years manufacturer warranty" is not English; the hyphenated form does not pluralise.
    expect(warrantyLabel(policy({ duration_value: 2 }))).toBe("2-year manufacturer warranty");
    expect(warrantyLabel(policy({ duration_value: 6, duration_unit: "month" }))).toBe(
      "6-month manufacturer warranty",
    );
  });

  it("names the servicing party, not just the duration", () => {
    expect(warrantyLabel(policy({ type: "distributor" }))).toBe("1-year distributor warranty");
    expect(warrantyLabel(policy({ type: "shop", duration_value: 6, duration_unit: "month" }))).toBe(
      "6-month shop warranty",
    );
  });

  it("states the absence of a warranty explicitly (CUST-008)", () => {
    // A blank is not acceptable; the customer must be told there is no cover.
    expect(warrantyLabel(policy({ type: "none", duration_value: 0 }))).toBe("No warranty");
    expect(warrantyLabel(policy({ duration_value: 0 }))).toBe("No warranty");
  });
});
