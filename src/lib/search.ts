import { cacheLife, cacheTag } from "next/cache";
import { capture, unwrap, type Degradable } from "./cached-read";
import type { AutocompleteSuggestion, SearchResponse } from "@/lib/pk";
import { medusaFetch } from "./medusa";

/**
 * Search read path.
 *
 * The storefront calls one commerce endpoint (`/store/search`) rather than a search engine
 * directly — 09_API_AND_EVENT_CONTRACTS.md section 5 — so no engine credential ever
 * reaches a browser and the engine can be replaced (ADR-004) without touching a page.
 *
 * Search is non-authoritative (ADR-014). Everything here is display data; the PDP and the
 * application revalidate price and stock against commerce before anything is agreed.
 */

export interface SearchParams {
  q: string;
  category?: string;
  /** Canonical brand handles (INST-002), not display names. */
  brands?: string[];
  /** Upper bound on the cheapest monthly installment figure. */
  monthlyMax?: number | null;
  installmentsOnly?: boolean;
  priceMin?: number | null;
  priceMax?: number | null;
  inStockOnly?: boolean;
  attributes?: Record<string, string[]>;
  sort?: "relevance" | "price_asc" | "price_desc" | "newest";
  page?: number;
  perPage?: number;
}

/**
 * The catalogue read path, and the one every listing surface goes through.
 *
 * Cached for an hour on the whole call, keyed by `params`, so a filter combination that
 * anybody has already asked for costs nothing to serve again. ADR-014 permits results to
 * lag; this is a wider window than the minute it used to be, and it is what lets `/phones`
 * and the brand pages be served from a prerendered shell rather than a live query.
 */
export async function search(params: SearchParams): Promise<SearchResponse> {
  return unwrap(await fetchSearch(params));
}

async function fetchSearch(params: SearchParams): Promise<Degradable<SearchResponse>> {
  "use cache";
  cacheLife("hours");
  cacheTag("search");

  const query = new URLSearchParams();
  query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  // `brand_handle`, not `brand`: the free-text parameter still works for older links but
  // it splits Xiaomi into four brands and scans an unindexed column.
  for (const brand of params.brands ?? []) query.append("brand_handle", brand);
  if (params.monthlyMax != null) query.set("monthly_max", String(params.monthlyMax));
  if (params.installmentsOnly) query.set("has_installments", "true");
  if (params.priceMin != null) query.set("price_gte", String(params.priceMin));
  if (params.priceMax != null) query.set("price_lte", String(params.priceMax));
  if (params.inStockOnly) query.set("in_stock", "true");
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.perPage) query.set("per_page", String(params.perPage));

  for (const [key, values] of Object.entries(params.attributes ?? {})) {
    if (values.length > 0) query.set(`attr.${key}`, values.join(","));
  }

  return capture(async () => {
    const response = await medusaFetch<{ data: SearchResponse }>(
      `/store/search?${query.toString()}`,
    );

    // An empty result set is only ever a real empty result set. A failed search throws, so
    // "no phones match" is never something an outage can put on the page.
    return response.data;
  });
}

/**
 * Type-ahead. A shorter profile than the catalogue: this is called per keystroke, the same
 * prefixes recur constantly across visitors, and a suggestion list that is a few minutes
 * behind the catalogue costs nobody anything.
 */
export async function autocomplete(query: string): Promise<AutocompleteSuggestion[]> {
  if (query.trim().length < 2) return [];
  return fetchSuggestions(query);
}

async function fetchSuggestions(query: string): Promise<AutocompleteSuggestion[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("search");

  const response = await medusaFetch<{ data: { suggestions: AutocompleteSuggestion[] } }>(
    `/store/search/autocomplete?q=${encodeURIComponent(query)}`,
    { timeoutMs: 3_000 },
  );

  return response.data.suggestions;
}
