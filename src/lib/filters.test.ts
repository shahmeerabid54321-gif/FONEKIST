import { describe, expect, it } from "vitest";
import {
  activeChips,
  buildFilterQuery,
  clearRange,
  hasActiveFilters,
  parseFilters,
  toggleAttributeValue,
  toggleBrand,
} from "./filters";

/**
 * Filter state tests.
 *
 * UX spec section 4 requires the URL to reflect filter state and the back button to work.
 * That only holds if parse and build round-trip exactly, which is what these pin down.
 */

describe("parseFilters", () => {
  it("defaults sensibly for an empty query", () => {
    expect(parseFilters({})).toEqual({
      sort: "relevance",
      page: 1,
      brands: [],
      monthlyMax: null,
      installmentsOnly: false,
      priceMin: null,
      priceMax: null,
      inStockOnly: false,
      attributes: {},
      ranges: {},
    });
  });

  it("reads attribute selections from attr.* parameters", () => {
    const state = parseFilters({ "attr.ram_gb": "16,32", "attr.panel_type": "oled" });
    expect(state.attributes).toEqual({ ram_gb: ["16", "32"], panel_type: ["oled"] });
  });

  it("accepts repeated parameters as well as comma-separated values", () => {
    const state = parseFilters({ "attr.ram_gb": ["16", "32"] });
    expect(state.attributes.ram_gb).toEqual(["16", "32"]);
  });

  it("ignores an unknown sort rather than failing the page", () => {
    expect(parseFilters({ sort: "cheapest-ever" }).sort).toBe("relevance");
  });

  it("clamps a nonsensical page number to the first page", () => {
    expect(parseFilters({ page: "0" }).page).toBe(1);
    expect(parseFilters({ page: "-3" }).page).toBe(1);
    expect(parseFilters({ page: "abc" }).page).toBe(1);
  });

  it("rejects a negative price bound", () => {
    expect(parseFilters({ price_min: "-100" }).priceMin).toBeNull();
  });

  it("drops empty attribute values", () => {
    expect(parseFilters({ "attr.ram_gb": ",, ," }).attributes).toEqual({});
  });
});

describe("buildFilterQuery", () => {
  it("omits defaults so a clean URL stays clean", () => {
    expect(buildFilterQuery({ sort: "relevance", page: 1 })).toBe("");
  });

  it("round-trips through parseFilters", () => {
    const state = parseFilters({
      "attr.ram_gb": "16,32",
      sort: "price_asc",
      page: "3",
      in_stock: "1",
      price_max: "200000",
    });

    const query = buildFilterQuery(state);
    const reparsed = parseFilters(
      Object.fromEntries(new URLSearchParams(query.slice(1)).entries()),
    );

    expect(reparsed).toEqual(state);
  });
});

describe("toggleAttributeValue", () => {
  const base = parseFilters({ "attr.ram_gb": "16", page: "4" });

  it("adds a value that is not selected", () => {
    expect(toggleAttributeValue(base, "ram_gb", "32").attributes.ram_gb).toEqual(["16", "32"]);
  });

  it("removes a value that is selected", () => {
    expect(toggleAttributeValue(base, "ram_gb", "16").attributes.ram_gb).toBeUndefined();
  });

  it("returns to the first page whenever the selection changes", () => {
    // Staying on page 4 of a smaller result set shows a blank page and reads as a bug.
    expect(toggleAttributeValue(base, "ram_gb", "32").page).toBe(1);
  });
});

describe("activeChips", () => {
  const facets = [
    {
      key: "ram_gb",
      label: "Memory",
      type: "checkbox" as const,
      group: null,
      unit: "GB",
      values: [{ value: "16", label: "16 GB", count: 5, selected: true }],
    },
  ];

  it("labels a chip with the facet label and the value label", () => {
    const chips = activeChips(parseFilters({ "attr.ram_gb": "16" }), facets);
    expect(chips[0]?.label).toBe("Memory: 16 GB");
  });

  it("gives each chip a URL with only that selection removed", () => {
    const state = parseFilters({ "attr.ram_gb": "16", in_stock: "1" });
    const chips = activeChips(state, facets);

    const memoryChip = chips.find((chip) => chip.label.startsWith("Memory"));
    expect(memoryChip?.removeQuery).toContain("in_stock=1");
    expect(memoryChip?.removeQuery).not.toContain("ram_gb");
  });

  it("reports no active filters for a clean state", () => {
    expect(hasActiveFilters(parseFilters({}))).toBe(false);
    expect(hasActiveFilters(parseFilters({ "attr.ram_gb": "16" }))).toBe(true);
  });
});

describe("numeric range filters", () => {
  it("parses min and max bounds for an attribute", () => {
    const state = parseFilters({ "attr.weight_g.min": "1000", "attr.weight_g.max": "1400" });
    expect(state.ranges).toEqual({ weight_g: { min: 1000, max: 1400 } });
    // A bound is not a value selection; the two must not be conflated.
    expect(state.attributes).toEqual({});
  });

  it("accepts a bound on its own", () => {
    expect(parseFilters({ "attr.weight_g.max": "1400" }).ranges).toEqual({
      weight_g: { min: null, max: 1400 },
    });
  });

  it("swaps bounds entered the wrong way round rather than returning nothing", () => {
    expect(parseFilters({ "attr.weight_g.min": "1400", "attr.weight_g.max": "1000" }).ranges).toEqual({
      weight_g: { min: 1000, max: 1400 },
    });
  });

  it("ignores a bound that is not a number", () => {
    expect(parseFilters({ "attr.weight_g.min": "light" }).ranges).toEqual({});
  });

  it("round-trips through the query string", () => {
    const state = parseFilters({ "attr.weight_g.min": "1000", "attr.weight_g.max": "1400" });
    const query = buildFilterQuery(state);

    expect(query).toContain("attr.weight_g.min=1000");
    expect(query).toContain("attr.weight_g.max=1400");
    expect(parseFilters(Object.fromEntries(new URLSearchParams(query.slice(1))))).toEqual(state);
  });

  it("counts as an active filter and can be cleared", () => {
    const state = parseFilters({ "attr.weight_g.max": "1400" });
    expect(hasActiveFilters(state)).toBe(true);
    expect(hasActiveFilters(clearRange(state, "weight_g"))).toBe(false);
  });

  it("describes the range in a removable chip", () => {
    const state = parseFilters({ "attr.weight_g.min": "1000", "attr.weight_g.max": "1400" });
    const chips = activeChips(state, [
      {
        key: "weight_g",
        label: "Weight",
        type: "range",
        group: "Physical",
        unit: "g",
        values: [],
      },
    ]);

    expect(chips).toHaveLength(1);
    expect(chips[0]?.label).toBe("Weight: 1000 g to 1400 g");
    expect(chips[0]?.removeQuery).toBe("");
  });
});

describe("brand and installment filters", () => {
  it("reads brand handles from a comma-separated parameter", () => {
    expect(parseFilters({ brand: "samsung,apple" }).brands).toEqual(["samsung", "apple"]);
  });

  it("normalises case and de-duplicates brands", () => {
    expect(parseFilters({ brand: "Samsung,samsung, APPLE " }).brands).toEqual([
      "samsung",
      "apple",
    ]);
  });

  it("reads a monthly payment ceiling", () => {
    expect(parseFilters({ monthly_max: "8000" }).monthlyMax).toBe(8000);
    expect(parseFilters({ monthly_max: "not-a-number" }).monthlyMax).toBeNull();
  });

  it("reads the installments-only flag as an exact 1", () => {
    expect(parseFilters({ installments: "1" }).installmentsOnly).toBe(true);
    expect(parseFilters({ installments: "true" }).installmentsOnly).toBe(false);
  });

  it("round-trips through the query builder", () => {
    // The URL is the single source of truth for filter state, so a serialised selection has
    // to parse back to the same selection or the back button produces a different page.
    //
    // Brand order is not preserved, and deliberately so: the serialiser sorts, which is what
    // makes one selection produce one URL. So the round trip is asserted as a fixed point
    // rather than as an identity, which is the property that actually matters.
    const state = parseFilters({
      brand: "xiaomi,samsung",
      monthly_max: "12000",
      installments: "1",
      in_stock: "1",
      sort: "price_asc",
    });

    const once = parseFilters(queryToParams(buildFilterQuery(state)));
    const twice = parseFilters(queryToParams(buildFilterQuery(once)));

    expect(twice).toEqual(once);
    expect([...once.brands].sort()).toEqual([...state.brands].sort());
    expect(once.monthlyMax).toBe(12000);
    expect(once.installmentsOnly).toBe(true);
    expect(once.inStockOnly).toBe(true);
    expect(once.sort).toBe("price_asc");
  });

  it("sorts brands in the query string so one selection is always one URL", () => {
    const query = buildFilterQuery({ ...parseFilters({}), brands: ["xiaomi", "apple"] });
    expect(query).toContain("brand=apple%2Cxiaomi");
  });

  it("toggles a brand off and returns to page one", () => {
    const state = { ...parseFilters({ brand: "apple", page: "3" }) };
    const next = toggleBrand(state, "apple");
    expect(next.brands).toEqual([]);
    // Staying on page 3 of a larger result set shows a different page and reads as a bug.
    expect(next.page).toBe(1);
  });

  it("counts brand and installment selections as active filters", () => {
    expect(hasActiveFilters(parseFilters({}))).toBe(false);
    expect(hasActiveFilters(parseFilters({ brand: "apple" }))).toBe(true);
    expect(hasActiveFilters(parseFilters({ monthly_max: "8000" }))).toBe(true);
    expect(hasActiveFilters(parseFilters({ installments: "1" }))).toBe(true);
  });

  it("offers a removal chip for every active filter", () => {
    const state = parseFilters({ brand: "apple", monthly_max: "8000", installments: "1" });
    const chips = activeChips(state, []);
    expect(chips).toHaveLength(3);
    // Every chip must lead somewhere the filter is gone, or it is decoration.
    for (const chip of chips) {
      expect(chip.removeQuery).not.toContain(chip.label.toLowerCase().replace(/\s/g, ""));
    }
  });
});

/** Turns a `?a=b&c=d` string back into the params shape a page receives. */
function queryToParams(query: string): Record<string, string | string[] | undefined> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(query.replace(/^\?/, ""))) {
    params[key] = value;
  }
  return params;
}
