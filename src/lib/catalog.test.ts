import { describe, expect, it } from "vitest";
import { defaultVariant, priceFor, stockLevelFor, type MedusaProduct, type MedusaVariant } from "./catalog";

/**
 * Catalog read-model tests.
 *
 * These cover the two places where the storefront makes a judgement about commerce data:
 * how stock is described to a customer, and whether a compare-at price is a real saving.
 * PRD section 8 forbids fake discounts and fake scarcity, so both are pinned here.
 */

const variant = (overrides: Partial<MedusaVariant> = {}): MedusaVariant => ({
  id: "variant_1",
  title: "Default",
  sku: "SKU-1",
  options: [],
  calculated_price: { calculated_amount: 100_000, original_amount: null, currency_code: "pkr" },
  inventory_quantity: 20,
  manage_inventory: true,
  ...overrides,
});

describe("stockLevelFor", () => {
  it("reports in stock for healthy inventory", () => {
    expect(stockLevelFor(variant({ inventory_quantity: 20 }))).toEqual({
      level: "in_stock",
      quantity: 20,
    });
  });

  it("reports low stock with the real number, never an invented one", () => {
    // "Only 3 left" is honest because 3 is the actual sellable quantity.
    expect(stockLevelFor(variant({ inventory_quantity: 3 }))).toEqual({
      level: "low_stock",
      quantity: 3,
    });
  });

  it("reports out of stock at zero", () => {
    expect(stockLevelFor(variant({ inventory_quantity: 0 })).level).toBe("out_of_stock");
  });

  it("treats a backorderable variant at zero as pre-order, not out of stock", () => {
    expect(
      stockLevelFor(variant({ inventory_quantity: 0, allow_backorder: true })).level,
    ).toBe("preorder");
  });

  it("treats an unmanaged variant as always available with no count", () => {
    // There is no number to show, so it must not invent one.
    expect(stockLevelFor(variant({ manage_inventory: false }))).toEqual({
      level: "in_stock",
      quantity: null,
    });
  });

  it("treats a missing quantity as out of stock rather than assuming availability", () => {
    // Failing closed: overselling is worse than under-promising (CUST-009).
    expect(stockLevelFor(variant({ inventory_quantity: null })).level).toBe("out_of_stock");
  });
});

describe("priceFor", () => {
  it("returns the calculated amount", () => {
    expect(priceFor(variant()).amount).toBe(100_000);
  });

  it("shows a compare-at price only when it is genuinely higher", () => {
    const discounted = variant({
      calculated_price: { calculated_amount: 90_000, original_amount: 100_000, currency_code: "pkr" },
    });
    expect(priceFor(discounted).compareAt).toBe(100_000);
  });

  it("suppresses a compare-at that is equal to the price", () => {
    // A struck-through price identical to the real one is a fabricated saving.
    const notADeal = variant({
      calculated_price: { calculated_amount: 100_000, original_amount: 100_000, currency_code: "pkr" },
    });
    expect(priceFor(notADeal).compareAt).toBeNull();
  });

  it("suppresses a compare-at that is lower than the price", () => {
    const wrong = variant({
      calculated_price: { calculated_amount: 100_000, original_amount: 80_000, currency_code: "pkr" },
      metadata: { compare_at_pkr: 80_000 },
    });
    expect(priceFor(wrong).compareAt).toBeNull();
  });

  it("falls back to the recorded compare-at when the pricing engine has no original", () => {
    const withMetadata = variant({
      calculated_price: { calculated_amount: 90_000, original_amount: null, currency_code: "pkr" },
      metadata: { compare_at_pkr: 110_000 },
    });
    expect(priceFor(withMetadata).compareAt).toBe(110_000);
  });
});

describe("defaultVariant", () => {
  const product = (variants: MedusaVariant[]): MedusaProduct =>
    ({
      id: "prod_1",
      title: "Test",
      subtitle: null,
      handle: "test",
      description: null,
      thumbnail: null,
      images: [],
      options: [],
      variants,
      categories: [],
      metadata: null,
    }) as MedusaProduct;

  it("prefers the cheapest variant that is actually in stock", () => {
    const chosen = defaultVariant(
      product([
        variant({ id: "cheap_but_gone", inventory_quantity: 0, calculated_price: { calculated_amount: 50_000, original_amount: null, currency_code: "pkr" } }),
        variant({ id: "available", inventory_quantity: 5, calculated_price: { calculated_amount: 80_000, original_amount: null, currency_code: "pkr" } }),
      ]),
    );

    // Landing on an out-of-stock variant makes the whole product look unavailable.
    expect(chosen?.id).toBe("available");
  });

  it("falls back to the cheapest variant when everything is out of stock", () => {
    const chosen = defaultVariant(
      product([
        variant({ id: "expensive", inventory_quantity: 0, calculated_price: { calculated_amount: 90_000, original_amount: null, currency_code: "pkr" } }),
        variant({ id: "cheapest", inventory_quantity: 0, calculated_price: { calculated_amount: 50_000, original_amount: null, currency_code: "pkr" } }),
      ]),
    );
    expect(chosen?.id).toBe("cheapest");
  });
});
