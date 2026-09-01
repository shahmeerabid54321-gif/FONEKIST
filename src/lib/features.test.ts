import { describe, expect, it } from "vitest";

/**
 * The gate is deliberately strict, so the cases that must NOT enable a feature are the
 * ones worth pinning: an unreviewed credit application should not ship because a
 * deployment set the flag to "1".
 */
const isEnabled = (value: string): boolean => value.trim().toLowerCase() === "true";

describe("feature gate", () => {
  it("enables only on an explicit true", () => {
    expect(isEnabled("true")).toBe(true);
    expect(isEnabled("TRUE")).toBe(true);
    expect(isEnabled("  true  ")).toBe(true);
  });

  it("treats every other value as off", () => {
    for (const value of ["", " ", "1", "yes", "on", "false", "no", "0", "truthy"]) {
      expect(isEnabled(value), value).toBe(false);
    }
  });
});
