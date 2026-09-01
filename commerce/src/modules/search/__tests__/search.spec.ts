import {
  buildSearchText,
  compactAlphanumeric,
  looksLikeIdentifier,
  normalizeText,
  tokenize,
} from "../normalize";
import {
  buildAutocompleteQuery,
  buildFacetQuery,
  buildSearchQuery,
  buildSuggestionQuery,
  editBudget,
} from "../query";

/** Counts the positional placeholders knex will try to fill. */
function placeholders(sql: string): number {
  return (sql.match(/\?/g) ?? []).length;
}

describe("search normalisation", () => {
  it.each([
    ["WH-1000XM6", "wh 1000xm6"],
    ["  Sony   Headphones  ", "sony headphones"],
    ["Café", "cafe"],
    ["Galaxy S24 Ultra", "galaxy s24 ultra"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it("compacts a model number so separators stop mattering", () => {
    expect(compactAlphanumeric("WH-1000XM6")).toBe("wh1000xm6");
    expect(compactAlphanumeric("wh 1000 xm6")).toBe("wh1000xm6");
  });

  it("drops stop words but never returns an empty token list", () => {
    expect(tokenize("headphones for the office")).toEqual(["headphones", "office"]);
    // A query that is nothing but stop words keeps them: matching nothing is better than
    // matching the whole catalogue.
    expect(tokenize("the a of")).toEqual(["the", "a", "of"]);
  });

  it("indexes both the spaced and separator-free form of a model number", () => {
    const text = buildSearchText({
      title: "Sony WH-1000XM6 Wireless Headphones",
      brand: "Sony",
      model: "WH-1000XM6",
      sku: "SONY-WH1000XM6-BLK",
    });

    expect(text).toContain("wh 1000xm6");
    expect(text).toContain("wh1000xm6");
    expect(text).toContain("sony");
  });

  it.each([
    ["WH-1000XM6", true],
    ["x1c-g11", true],
    ["wireless headphones", false],
    // Letters only: a brand name is not an identifier, however short.
    ["sony", false],
  ])("identifies %s as an identifier: %s", (input, expected) => {
    expect(looksLikeIdentifier(input)).toBe(expected);
  });

  it.each([
    ["15", 0],
    ["pro", 0],
    ["sony", 1],
    ["samsng", 1],
    ["macbook", 2],
  ])("gives %s an edit budget of %i", (token, budget) => {
    expect(editBudget(token)).toBe(budget);
  });
});

describe("search SQL", () => {
  /**
   * The bug this guards against was real: the score expression re-embedded the token and
   * trigram expressions, emitting their placeholders twice while binding their values
   * once. Postgres would then bind the wrong value to the wrong slot — or, on a good day,
   * reject the statement. Counting is cheap; debugging that is not.
   */
  it.each([
    ["a plain query", { q: "macbook air" }],
    ["an identifier query", { q: "wh1000xm6" }],
    ["an empty query", { q: "" }],
    ["filters", { q: "laptop", brands: ["Apple", "Dell"], priceMin: 1000, priceMax: 500000 }],
    ["attributes", { q: "laptop", attributes: { ram_gb: ["16", "32"], storage_gb: ["512"] } }],
    ["category and stock", { q: "", categoryHandles: ["laptops"], inStockOnly: true }],
  ])("binds exactly one value per placeholder for %s", (_label, params) => {
    const built = buildSearchQuery(params);
    expect(placeholders(built.sql)).toBe(built.bindings.length);

    // The facet query shares the scored subquery, so it must stay aligned too.
    const facets = buildFacetQuery(params);
    expect(placeholders(facets.sql)).toBe(facets.bindings.length);
  });

  it.each([
    ["autocomplete", buildAutocompleteQuery("wh1000")],
    ["suggestions", buildSuggestionQuery("makbook")],
  ])("binds exactly one value per placeholder for %s", (_label, built) => {
    expect(placeholders(built.sql)).toBe(built.bindings.length);
  });

  it("never interpolates user input into the statement", () => {
    const built = buildSearchQuery({ q: "'; drop table search_document; --" });

    expect(built.sql).not.toContain("drop table");
    // Punctuation is normalised away before the value is even bound.
    expect(built.bindings.some((binding) => String(binding).includes(";"))).toBe(false);
  });

  it("requires every token of a multi-word query", () => {
    // "iphone 15" must not match a 15-inch laptop just because "15" appears.
    expect(buildSearchQuery({ q: "iphone 15" }).sql).toContain("fuzzy_hits >= 2");
    expect(buildSearchQuery({ q: "iphone" }).sql).toContain("fuzzy_hits >= 1");
  });

  it("applies no match clause when there is no query", () => {
    expect(buildSearchQuery({ q: "" }).sql).not.toContain("fuzzy_hits >=");
  });

  it("excludes soft-deleted and unpublished documents", () => {
    const sql = buildSearchQuery({ q: "laptop" }).sql;
    expect(sql).toContain("d.published = true");
    expect(sql).toContain("d.deleted_at is null");
  });

  it("counts brands with the brand filter lifted so a selection can be widened", () => {
    const params = { q: "laptop", brands: ["Apple"] };
    expect(buildSearchQuery(params).sql).toContain("lower(coalesce(d.brand, '')) in");
    expect(buildFacetQuery(params).sql).not.toContain("lower(coalesce(d.brand, '')) in");
  });

  it("clamps the page size so a crafted request cannot ask for the whole catalogue", () => {
    expect(buildSearchQuery({ q: "a", perPage: 5000 }).sql).toContain("limit 60");
    expect(buildSearchQuery({ q: "a", perPage: -1 }).sql).toContain("limit 1");
  });
});

/**
 * The sales-channel boundary applied to a derived index (ADR-022).
 *
 * This is the case that was missed. Medusa scopes `/store/products` by the publishable
 * key's sales channels on its own, so the phone-only storefront looked correct. A custom
 * search endpoint built on our own index inherits none of that scoping, and it was quietly
 * serving the phone storefront laptops and headphones.
 */
describe("sales channel scoping", () => {
  it("scopes results to the caller's channels", () => {
    const { sql, bindings } = buildSearchQuery({ q: "", salesChannelIds: ["sc_fonekist"] });
    expect(sql).toContain("sales_channel_ids");
    expect(bindings).toContain("sc_fonekist");
  });

  it("binds every channel rather than interpolating any of them", () => {
    const { sql, bindings } = buildSearchQuery({
      q: "",
      salesChannelIds: ["sc_a", "sc_b"],
    });
    expect(bindings).toEqual(expect.arrayContaining(["sc_a", "sc_b"]));
    expect(sql).not.toContain("sc_a");
  });

  it("keeps the scope on the facet query too", () => {
    // A facet computed without the channel filter would count and offer products from
    // another storefront's catalogue, which is a leak even when the results are correct.
    const { sql, bindings } = buildFacetQuery({ q: "", salesChannelIds: ["sc_fonekist"] });
    expect(sql).toContain("sales_channel_ids");
    expect(bindings).toContain("sc_fonekist");
  });

  it("keeps the scope while the brand facet skips the brand filter", () => {
    // `skipFilter: "brands"` is what makes a brand facet usable. It must not take the
    // channel boundary with it.
    const { sql, bindings } = buildFacetQuery({
      q: "",
      brandHandles: ["samsung"],
      salesChannelIds: ["sc_fonekist"],
    });
    expect(sql).toContain("sales_channel_ids");
    expect(bindings).toContain("sc_fonekist");
    expect(bindings).not.toContain("samsung");
  });

  it("scopes autocomplete as well as search", () => {
    // Type-ahead is not a lesser surface: it would leak the other catalogue's product names
    // one keystroke at a time.
    const { sql, bindings } = buildAutocompleteQuery("gal", 8, ["sc_fonekist"]);
    expect(sql).toContain("sales_channel_ids");
    expect(bindings).toContain("sc_fonekist");
  });

  it("adds no clause when the key has no channels", () => {
    const { sql } = buildSearchQuery({ q: "", salesChannelIds: [] });
    expect(sql).not.toContain("sales_channel_ids");
  });
});
