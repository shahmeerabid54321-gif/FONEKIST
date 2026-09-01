import { brandDisplayName, type SearchFacet } from "@/lib/pk";

/**
 * PLP filter state, encoded in the URL.
 *
 * UX spec section 4: the URL reflects filter state and the browser back button works. That
 * is only true if the URL is the single source of truth — so this module owns the parsing
 * and serialisation, and no component keeps a private copy of the selection.
 */

export const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export interface NumericRange {
  min: number | null;
  max: number | null;
}

export interface FilterState {
  sort: SortValue;
  page: number;
  priceMin: number | null;
  priceMax: number | null;
  inStockOnly: boolean;
  /**
   * Canonical brand handles (`brand` query parameter).
   *
   * Handles, not display names: Redmi and POCO are Xiaomi, and a filter keyed on the
   * printed name would split one manufacturer across three chips that each show a fraction
   * of the range.
   */
  brands: string[];
  /**
   * Upper bound on the cheapest monthly installment figure.
   *
   * The filter this storefront exists for. A large share of this market shops by what they
   * can pay per month rather than by the price of the handset, and answering the question
   * the customer is actually asking is worth more than another spec facet.
   */
  monthlyMax: number | null;
  /** Only products with at least one offerable plan. */
  installmentsOnly: boolean;
  /** Attribute key → selected values, from `attr.<key>` query parameters. */
  attributes: Record<string, string[]>;
  /**
   * Attribute key → numeric bounds, from `attr.<key>.min` / `attr.<key>.max`.
   *
   * Continuous measures (weight, screen size) get a range rather than a tick list: every
   * product has its own figure, so a checkbox per value would offer one product per row
   * and discriminate nothing.
   */
  ranges: Record<string, NumericRange>;
}

const ATTRIBUTE_PREFIX = "attr.";
const RANGE_MIN_SUFFIX = ".min";
const RANGE_MAX_SUFFIX = ".max";

export function parseFilters(params: Record<string, string | string[] | undefined>): FilterState {
  const single = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const sortRaw = single("sort");
  const sort = SORT_OPTIONS.some((option) => option.value === sortRaw)
    ? (sortRaw as SortValue)
    : "relevance";

  const attributes: Record<string, string[]> = {};
  const ranges: Record<string, NumericRange> = {};

  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith(ATTRIBUTE_PREFIX) || value === undefined) continue;
    const rest = key.slice(ATTRIBUTE_PREFIX.length);

    const bound = rest.endsWith(RANGE_MIN_SUFFIX)
      ? "min"
      : rest.endsWith(RANGE_MAX_SUFFIX)
        ? "max"
        : null;

    if (bound) {
      const attributeKey = rest.slice(0, -4);
      const raw = Array.isArray(value) ? value[0] : value;
      const parsed = raw === undefined || raw === "" ? null : Number(raw);
      if (parsed === null || !Number.isFinite(parsed)) continue;
      const range = (ranges[attributeKey] ??= { min: null, max: null });
      range[bound] = parsed;
      continue;
    }

    const values = (Array.isArray(value) ? value : [value]).flatMap((entry) => entry.split(","));
    const cleaned = values.map((entry) => entry.trim()).filter(Boolean);
    if (cleaned.length > 0) attributes[rest] = cleaned;
  }

  // A range where the bounds were entered the wrong way round is a typo, not a request for
  // an empty result set.
  for (const range of Object.values(ranges)) {
    if (range.min != null && range.max != null && range.min > range.max) {
      [range.min, range.max] = [range.max, range.min];
    }
  }

  const toPositiveInt = (raw: string | undefined): number | null => {
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
  };

  const brandRaw = params.brand;
  const brands = (Array.isArray(brandRaw) ? brandRaw : brandRaw ? [brandRaw] : [])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return {
    sort,
    page: Math.max(1, toPositiveInt(single("page")) ?? 1),
    priceMin: toPositiveInt(single("price_min")),
    priceMax: toPositiveInt(single("price_max")),
    inStockOnly: single("in_stock") === "1",
    brands: [...new Set(brands)],
    monthlyMax: toPositiveInt(single("monthly_max")),
    installmentsOnly: single("installments") === "1",
    attributes,
    ranges,
  };
}

/** Serialises state back to a query string, omitting defaults so URLs stay readable. */
export function buildFilterQuery(state: Partial<FilterState>): string {
  const params = new URLSearchParams();

  if (state.sort && state.sort !== "relevance") params.set("sort", state.sort);
  if (state.page && state.page > 1) params.set("page", String(state.page));
  if (state.priceMin != null) params.set("price_min", String(state.priceMin));
  if (state.priceMax != null) params.set("price_max", String(state.priceMax));
  if (state.inStockOnly) params.set("in_stock", "1");
  // Sorted so the same selection always produces the same URL: two links to the same
  // filtered view should be the same link, for caching and for the back button.
  if (state.brands?.length) params.set("brand", [...state.brands].sort().join(","));
  if (state.monthlyMax != null) params.set("monthly_max", String(state.monthlyMax));
  if (state.installmentsOnly) params.set("installments", "1");

  for (const [key, values] of Object.entries(state.attributes ?? {})) {
    if (values.length > 0) params.set(`${ATTRIBUTE_PREFIX}${key}`, values.join(","));
  }

  for (const [key, range] of Object.entries(state.ranges ?? {})) {
    if (range.min != null) params.set(`${ATTRIBUTE_PREFIX}${key}${RANGE_MIN_SUFFIX}`, String(range.min));
    if (range.max != null) params.set(`${ATTRIBUTE_PREFIX}${key}${RANGE_MAX_SUFFIX}`, String(range.max));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Returns the state with one attribute value toggled — the core interaction on a PLP. */
export function toggleAttributeValue(
  state: FilterState,
  key: string,
  value: string,
): FilterState {
  const current = state.attributes[key] ?? [];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];

  const attributes = { ...state.attributes };
  if (next.length > 0) attributes[key] = next;
  else delete attributes[key];

  // Changing a filter always returns to page one: staying on page 7 of a smaller result
  // set shows an empty page and reads as a bug.
  return { ...state, attributes, page: 1 };
}

/** Returns the state with one attribute's numeric range cleared. */
export function clearRange(state: FilterState, key: string): FilterState {
  const ranges = { ...state.ranges };
  delete ranges[key];
  return { ...state, ranges, page: 1 };
}

export interface ActiveChip {
  label: string;
  /** Query string for the URL with this selection removed. */
  removeQuery: string;
}

/** The active filter chips shown above the grid (UX spec section 4). */
export function activeChips(state: FilterState, facets: SearchFacet[]): ActiveChip[] {
  const chips: ActiveChip[] = [];

  for (const [key, values] of Object.entries(state.attributes)) {
    const facet = facets.find((candidate) => candidate.key === key);
    for (const value of values) {
      const label = facet?.values.find((entry) => entry.value === value)?.label ?? value;
      chips.push({
        label: `${facet?.label ?? key}: ${label}`,
        removeQuery: buildFilterQuery(toggleAttributeValue(state, key, value)),
      });
    }
  }

  for (const [key, range] of Object.entries(state.ranges)) {
    if (range.min == null && range.max == null) continue;
    const facet = facets.find((candidate) => candidate.key === key);
    const unit = facet?.unit ? ` ${facet.unit}` : "";
    const min = range.min != null ? `${range.min}${unit}` : "Any";
    const max = range.max != null ? `${range.max}${unit}` : "Any";
    chips.push({
      label: `${facet?.label ?? key}: ${min} to ${max}`,
      removeQuery: buildFilterQuery(clearRange(state, key)),
    });
  }

  for (const handle of state.brands) {
    chips.push({
      label: brandDisplayName(handle),
      removeQuery: buildFilterQuery(toggleBrand(state, handle)),
    });
  }

  if (state.monthlyMax != null) {
    chips.push({
      label: `Up to Rs ${state.monthlyMax.toLocaleString("en-PK")} a month`,
      removeQuery: buildFilterQuery({ ...state, monthlyMax: null, page: 1 }),
    });
  }

  if (state.installmentsOnly) {
    chips.push({
      label: "Available on installments",
      removeQuery: buildFilterQuery({ ...state, installmentsOnly: false, page: 1 }),
    });
  }

  if (state.inStockOnly) {
    chips.push({
      label: "In stock only",
      removeQuery: buildFilterQuery({ ...state, inStockOnly: false, page: 1 }),
    });
  }

  if (state.priceMin != null || state.priceMax != null) {
    const min = state.priceMin != null ? `Rs ${state.priceMin.toLocaleString("en-PK")}` : "Any";
    const max = state.priceMax != null ? `Rs ${state.priceMax.toLocaleString("en-PK")}` : "Any";
    chips.push({
      label: `Price: ${min} to ${max}`,
      removeQuery: buildFilterQuery({ ...state, priceMin: null, priceMax: null, page: 1 }),
    });
  }

  return chips;
}

/** Returns the state with one brand toggled. */
export function toggleBrand(state: FilterState, handle: string): FilterState {
  const brands = state.brands.includes(handle)
    ? state.brands.filter((entry) => entry !== handle)
    : [...state.brands, handle];
  return { ...state, brands, page: 1 };
}

export function hasActiveFilters(state: FilterState): boolean {
  return (
    state.brands.length > 0 ||
    state.monthlyMax != null ||
    state.installmentsOnly ||
    Object.keys(state.attributes).length > 0 ||
    Object.values(state.ranges).some((range) => range.min != null || range.max != null) ||
    state.inStockOnly ||
    state.priceMin != null ||
    state.priceMax != null
  );
}
