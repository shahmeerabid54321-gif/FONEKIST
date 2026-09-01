import type {
  AutocompleteSuggestion,
  SearchDocumentInput,
  SearchFacet,
  SearchHit,
  SearchProvider,
  SearchRequest,
  SearchResponse,
} from "@pk/contracts";
import { randomUUID } from "node:crypto";
import {
  buildAutocompleteQuery,
  buildFacetQuery,
  buildSearchQuery,
  buildSuggestionQuery,
} from "./query";
import type SearchIndexService from "./service";

/**
 * PostgreSQL implementation of `SearchProvider`.
 *
 * ADR-004 chooses Typesense; ADR-019 defers it to Phase 2 and puts this behind the same
 * interface in the meantime. `pg_trgm` gives genuine typo tolerance (CUST-003) at the MVP
 * catalogue size. It will not scale to a large catalogue — every query scans and scores
 * the index table — which is exactly why the interface exists.
 */

/** Minimal shape of a knex instance; typed here so the module does not depend on knex. */
export interface SqlExecutor {
  raw<T = Record<string, unknown>>(sql: string, bindings: unknown[]): Promise<{ rows: T[] }>;
}

interface HitRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  handle: string;
  title: string;
  brand: string | null;
  brand_handle: string | null;
  model_name: string | null;
  sku: string | null;
  price_pkr: string | number;
  compare_at_pkr: string | number | null;
  in_stock: boolean;
  warranty_label: string | null;
  thumbnail: string | null;
  key_specs: { label: string; value: string }[] | null;
  attributes: Record<string, string[]> | null;
  has_installments: boolean;
  min_monthly_pkr: string | number | null;
  min_advance_pkr: string | number | null;
  total_count: string | number;
  token_hits: string | number;
  trigram_score: string | number;
}

export class PostgresSearchProvider implements SearchProvider {
  readonly id = "postgres";

  constructor(
    private readonly sql: SqlExecutor,
    private readonly index_: Pick<SearchIndexService, "indexDocuments" | "removeDocuments">,
  ) {}

  async search(request: SearchRequest): Promise<SearchResponse> {
    const params = {
      q: request.q,
      categoryHandles: request.category ? [request.category] : [],
      brands: request.brand,
      brandHandles: request.brand_handle,
      monthlyMax: request.monthly_max ?? null,
      hasInstallments: request.has_installments ?? false,
      priceMin: request.price_gte ?? null,
      priceMax: request.price_lte ?? null,
      inStockOnly: request.in_stock ?? false,
      attributes: request.attributes,
      salesChannelIds: request.sales_channel_ids,
      sort: request.sort,
      page: request.page,
      perPage: request.per_page,
    };

    const query = buildSearchQuery(params);
    const { rows } = await this.sql.raw<HitRow>(query.sql, query.bindings);

    const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;

    const hits: SearchHit[] = rows.map((row) => ({
      product_id: row.product_id,
      variant_id: row.variant_id,
      slug: row.handle,
      title: row.title,
      brand: row.brand,
      brand_handle: row.brand_handle,
      model: row.model_name,
      sku: row.sku,
      price_pkr: Number(row.price_pkr),
      compare_at_pkr: row.compare_at_pkr == null ? null : Number(row.compare_at_pkr),
      in_stock: row.in_stock,
      warranty_label: row.warranty_label ?? "",
      thumbnail: row.thumbnail,
      key_specs: row.key_specs ?? [],
      attributes: row.attributes ?? {},
      has_installments: Boolean(row.has_installments),
      min_monthly_pkr: row.min_monthly_pkr == null ? null : Number(row.min_monthly_pkr),
      min_advance_pkr: row.min_advance_pkr == null ? null : Number(row.min_advance_pkr),
    }));

    const facets = await this.facetsFor(params);

    // Suggestions are offered when the query matched nothing, and also when it matched
    // only fuzzily — a customer who typed `logitec` should see the results *and* be told
    // what the catalogue actually calls it, rather than quietly getting the corrected set.
    const matchedExactly = rows.some((row) => Number(row.token_hits) > 0);
    const suggestions =
      request.q && (rows.length === 0 || !matchedExactly) ? await this.suggestionsFor(request.q) : [];

    return {
      hits,
      facets,
      normalized_query: query.normalizedQuery,
      // Correlates this search with downstream analytics (08_DATA_MODEL.md section 15).
      // Non-authoritative by ADR-015: it identifies a query, never a person.
      query_id: `q_${randomUUID()}`,
      page: request.page,
      per_page: request.per_page,
      total,
      total_pages: Math.ceil(total / request.per_page),
      suggestions,
    };
  }

  async autocomplete(
    query: string,
    limit = 8,
    salesChannelIds: string[] = [],
  ): Promise<AutocompleteSuggestion[]> {
    if (query.trim().length < 2) return [];

    // Scoped exactly like search. Type-ahead that suggests a product the storefront cannot
    // sell sends the customer to a 404 and leaks the other catalogue's names.
    const built = buildAutocompleteQuery(query, limit, salesChannelIds);
    const { rows } = await this.sql.raw<{
      title: string;
      handle: string;
      thumbnail: string | null;
      price_pkr: string | number;
      in_stock: boolean;
    }>(built.sql, built.bindings);

    return rows.map((row) => ({
      text: row.title,
      handle: row.handle,
      thumbnail: row.thumbnail,
      price_pkr: Number(row.price_pkr),
      in_stock: row.in_stock,
    }));
  }

  async index(documents: SearchDocumentInput[]): Promise<void> {
    await this.index_.indexDocuments(documents);
  }

  async remove(ids: string[]): Promise<void> {
    await this.index_.removeDocuments(ids);
  }

  private async facetsFor(params: Parameters<typeof buildFacetQuery>[0]): Promise<SearchFacet[]> {
    const query = buildFacetQuery(params);
    const { rows } = await this.sql.raw<{
      brand: string | null;
      brand_handle: string | null;
      count: number;
      min_price: number;
      max_price: number;
      in_stock_count: number;
    }>(query.sql, query.bindings);

    const brands = rows.filter((row) => row.brand);
    if (brands.length === 0) return [];

    const selected = new Set(params.brandHandles ?? []);

    /*
     * Counted by canonical handle, displayed by the name on the box.
     *
     * Grouping by free-text `brand` produced one facet row per spelling, so "Xiaomi (2)",
     * "Redmi (3)" and "POCO (1)" sat beside each other describing one manufacturer. The
     * rows are folded here and the first display name for each handle wins.
     */
    const byHandle = new Map<string, { label: string; count: number }>();
    for (const row of brands) {
      const handle = row.brand_handle ?? row.brand!.toLowerCase();
      const existing = byHandle.get(handle);
      if (existing) existing.count += Number(row.count);
      else byHandle.set(handle, { label: row.brand!, count: Number(row.count) });
    }

    const facets: SearchFacet[] = [
      {
        key: "brand_handle",
        label: "Brand",
        type: "checkbox",
        group: null,
        unit: null,
        values: [...byHandle.entries()]
          .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
          .map(([handle, entry]) => ({
            value: handle,
            label: entry.label,
            count: entry.count,
            selected: selected.has(handle),
          })),
      },
    ];

    // A facet with a single option filters nothing; it is decoration.
    return facets.filter((facet) => facet.values.length > 1);
  }

  private async suggestionsFor(q: string): Promise<string[]> {
    const built = buildSuggestionQuery(q);
    const { rows } = await this.sql.raw<{ title: string; brand: string | null; model_name: string | null }>(
      built.sql,
      built.bindings,
    );

    // Prefer the shortest useful correction: a model number is a better thing to retype
    // than a 12-word product title.
    const candidates = rows.flatMap((row) => [row.model_name, row.brand, row.title].filter(Boolean) as string[]);
    return [...new Set(candidates)].slice(0, 3);
  }
}
