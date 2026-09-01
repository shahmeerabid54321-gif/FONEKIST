/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/providers/search-provider.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

import type { SearchRequest, SearchResponse } from "../schemas/api";

/**
 * Search provider contract. Source of truth: ADR-004, ADR-014 and ADR-019.
 *
 * Search is a *derived*, non-authoritative read path: it may lag, and it never decides a
 * price, an availability or a payment (ADR-014). Everything it returns is revalidated in
 * commerce before anything is charged.
 *
 * The interface exists so the engine is replaceable. The MVP ships a PostgreSQL
 * implementation; Typesense (ADR-004) becomes a second implementation of exactly this
 * shape in Phase 2, and no page or endpoint above it changes.
 */

export interface SearchDocumentInput {
  id: string;
  product_id: string;
  variant_id: string | null;
  handle: string;
  title: string;
  brand: string | null;
  /**
   * Canonical brand identity (`brandHandle`). `brand` is what is displayed; this is what
   * is filtered and faceted on, so Redmi and POCO land on the Xiaomi brand page instead of
   * fragmenting it into three (INST-002).
   */
  brand_handle: string | null;
  model: string | null;
  sku: string | null;
  category_ids: string[];
  category_handles: string[];
  /**
   * The sales channels this product is sold through.
   *
   * Search is a *derived* index, so it does not inherit the sales-channel scoping that
   * Medusa applies to `/store/products`. Without this field a custom search endpoint
   * answers every publishable key with the whole catalogue, which silently defeats the
   * channel boundary that decides what each storefront may sell (ADR-022).
   */
  sales_channel_ids: string[];
  price_pkr: number;
  compare_at_pkr: number | null;
  in_stock: boolean;
  warranty_type: string | null;
  warranty_label: string | null;
  attributes: Record<string, string[]>;
  key_specs: { label: string; value: string }[];
  thumbnail: string | null;
  popularity_score: number;
  published: boolean;
  product_created_at: Date | null;
  /**
   * Installment availability, denormalised onto the document.
   *
   * A grid that showed "from Rs X/month" by looking each product up would issue one query
   * per card, and a "monthly payment under Rs Y" filter could not be expressed in the
   * search query at all. These three fields are display values like every other field
   * here: the PDP reads the authoritative plan before anything is agreed (ADR-014).
   */
  has_installments: boolean;
  min_monthly_pkr: number | null;
  min_advance_pkr: number | null;
}

export interface AutocompleteSuggestion {
  /** What to put in the search box if the customer picks this. */
  text: string;
  /** Present when the suggestion is a specific product rather than a query completion. */
  handle: string | null;
  thumbnail: string | null;
  price_pkr: number | null;
  in_stock: boolean | null;
}

export interface SearchProvider {
  readonly id: string;

  /** Full search. Returns hits, facets, pagination and any "did you mean" suggestions. */
  search(request: SearchRequest): Promise<SearchResponse>;

  /**
   * Type-ahead. Must be cheap enough to call on a keystroke.
   *
   * `salesChannelIds` scopes the suggestions exactly as `search` is scoped. It is a required
   * part of the contract rather than an optional convenience: an implementation that
   * ignored it would leak one storefront's product names into another's search box.
   */
  autocomplete(
    query: string,
    limit?: number,
    salesChannelIds?: string[],
  ): Promise<AutocompleteSuggestion[]>;

  /** Upserts documents. Must be idempotent: reindexing the same product twice is normal. */
  index(documents: SearchDocumentInput[]): Promise<void>;

  /** Removes documents by product id, e.g. when a product is unpublished or archived. */
  remove(ids: string[]): Promise<void>;
}
