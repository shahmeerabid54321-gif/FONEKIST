import { describe, expect, it } from "vitest";
import { FINDER_QUESTIONS, finderHref } from "./phone-finder";

describe("finderHref", () => {
  it("turns a monthly budget into a monthly filter, not a price filter", () => {
    // The distinction is the point of the finder: somebody who can pay Rs 8,000 a month is
    // not shopping for a Rs 8,000 phone.
    const href = finderHref({ budget: "monthly-8000" });
    expect(href).toContain("monthly_max=8000");
    expect(href).toContain("installments=1");
    expect(href).not.toContain("price_max");
  });

  it("turns a cash budget into a price filter", () => {
    const href = finderHref({ budget: "cash-60000" });
    expect(href).toContain("price_max=60000");
    expect(href).not.toContain("monthly_max");
  });

  it("maps a priority onto a concrete, inspectable threshold", () => {
    // "The camera" means a main sensor of 50 MP or more and nothing else. A weighting
    // formula nobody can inspect would be a ranking opinion sold as a recommendation.
    expect(finderHref({ priority: "camera" })).toContain("attr.main_camera_mp.min=50");
    expect(finderHref({ priority: "battery" })).toContain("attr.battery_mah.min=5000");
    expect(finderHref({ priority: "performance" })).toContain("attr.ram_gb.min=8");
  });

  it("applies no spec filter when there is no preference", () => {
    const href = finderHref({ priority: "none" });
    expect(href).not.toContain("attr.");
  });

  it("omits the brand filter when the answer is everything", () => {
    expect(finderHref({ brand: "" })).not.toContain("brand=");
    expect(finderHref({ brand: "samsung" })).toContain("brand=samsung");
  });

  it("always lands on the catalogue, so every answer is adjustable", () => {
    expect(finderHref({})).toMatch(/^\/phones/);
    expect(finderHref({ budget: "monthly-15000", priority: "camera", brand: "apple" })).toMatch(
      /^\/phones\?/,
    );
  });

  it("only ever filters to things in stock", () => {
    expect(finderHref({})).toContain("in_stock=1");
  });
});

describe("FINDER_QUESTIONS", () => {
  it("is three questions, which is what the copy promises", () => {
    expect(FINDER_QUESTIONS).toHaveLength(3);
  });

  it("gives every question a way out", () => {
    // No question may trap somebody who has no opinion about it.
    const last = FINDER_QUESTIONS.find((question) => question.id === "brand");
    expect(last?.options.some((option) => option.value === "")).toBe(true);
    const priority = FINDER_QUESTIONS.find((question) => question.id === "priority");
    expect(priority?.options.some((option) => option.value === "none")).toBe(true);
  });
});
