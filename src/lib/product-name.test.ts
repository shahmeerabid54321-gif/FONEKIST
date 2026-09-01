import { describe, expect, it } from "vitest";
import { displayName } from "./product-name";

describe("displayName", () => {
  it("strips a leading brand the card already shows", () => {
    expect(displayName("Samsung Galaxy S24 Ultra", "Samsung")).toBe("Galaxy S24 Ultra");
    expect(displayName("Xiaomi Redmi Note 13 Pro", "Xiaomi")).toBe("Redmi Note 13 Pro");
  });

  it("matches the brand case-insensitively", () => {
    expect(displayName("SAMSUNG Galaxy A55", "Samsung")).toBe("Galaxy A55");
  });

  it("leaves a title that does not start with the brand", () => {
    expect(displayName("Galaxy S24 Ultra by Samsung", "Samsung")).toBe(
      "Galaxy S24 Ultra by Samsung",
    );
    expect(displayName("Pixel 8", "Google")).toBe("Pixel 8");
  });

  it("does not strip a title down to nothing", () => {
    expect(displayName("Samsung", "Samsung")).toBe("Samsung");
  });

  it("passes the title through when the brand is unknown", () => {
    expect(displayName("Galaxy S24 Ultra", null)).toBe("Galaxy S24 Ultra");
  });

  it("does not strip a brand that only appears mid-title", () => {
    expect(displayName("Redmi Note 13 Pro Xiaomi Edition", "Xiaomi")).toBe(
      "Redmi Note 13 Pro Xiaomi Edition",
    );
  });
});
