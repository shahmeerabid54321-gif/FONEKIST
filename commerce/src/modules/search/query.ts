import { compactAlphanumeric, looksLikeIdentifier, normalizeText, tokenize } from "./normalize";

/**
 * SQL for the PostgreSQL search implementation.
 *
 * ADR-004 names Typesense as the search engine and ADR-019 defers it to Phase 2. This is
 * the interim implementation behind the same `SearchProvider` shape: PostgreSQL trigram
 * similarity (`pg_trgm`) gives real typo tolerance for CUST-003 at MVP catalogue size.
 *
 * The builders are pure functions returning SQL and bindings, so the ranking rules can be
 * tested without a database and every value reaching PostgreSQL is bound rather than
 * interpolated.
 */

/**
 * Minimum trigram similarity for a fuzzy match. Below roughly this level, matches stop
 * being "the customer misspelled it" and start being "these two strings share some
 * letters" — a query for `mouse` would surface `Mo Case`.
 */
export const TRIGRAM_THRESHOLD = 0.28;

/**
 * How many single-character edits a token may be wrong by and still count as that word.
 *
 * Scaled by length, because an edit budget is only meaningful relative to the word: two
 * edits turn `pro` into an unrelated word but leave `macbook` unmistakable. Tokens shorter
 * than four characters get no budget at all — at that length almost everything is within
 * one edit of almost everything else, and `15` must not match `16`.
 */
export function editBudget(token: string): number {
  if (token.length < 4) return 0;
  if (token.length <= 6) return 1;
  return 2;
}

export interface SearchQueryParams {
  q: string;
  categoryHandles?: string[];
  brands?: string[];
  /** Canonical brand handles. Preferred over `brands`, which is free text (INST-002). */
  brandHandles?: string[];
  /** Upper bound on the cheapest monthly installment figure. */
  monthlyMax?: number | null;
  /** Restricts to products with at least one offerable plan. */
  hasInstallments?: boolean;
  priceMin?: number | null;
  priceMax?: number | null;
  inStockOnly?: boolean;
  /** Attribute key → accepted values. Values within a key are OR'd, keys are AND'd. */
  attributes?: Record<string, string[]>;
  /**
   * Sales channels the caller may see, from the publishable key on the request.
   *
   * This is the ADR-022 boundary applied to a derived index. It is never `skip`ped by the
   * facet builder and never comes from a query parameter: a filter a client could remove
   * would not be a boundary.
   */
  salesChannelIds?: string[];
  sort?: "relevance" | "price_asc" | "price_desc" | "newest";
  page?: number;
  perPage?: number;
}

export interface BuiltQuery {
  sql: string;
  bindings: unknown[];
  /** The normalised form echoed back to the client as `normalized_query`. */
  normalizedQuery: string;
  tokens: string[];
}

const SELECTED_COLUMNS = [
  "id",
  "product_id",
  "variant_id",
  "handle",
  "title",
  "brand",
  "brand_handle",
  "model_name",
  "sku",
  "price_pkr",
  "compare_at_pkr",
  "in_stock",
  "warranty_type",
  "warranty_label",
  "thumbnail",
  "key_specs",
  "attributes",
  "category_handles",
  "popularity_score",
  "product_created_at",
  "has_installments",
  "min_monthly_pkr",
  "min_advance_pkr",
].join(", ");

/** Collects bindings in the order their placeholders appear in the SQL. */
function binder() {
  const bindings: unknown[] = [];
  return {
    bindings,
    bind(value: unknown): string {
      bindings.push(value);
      return "?";
    },
  };
}

/**
 * The structural filters, shared by the result query and the facet query so a facet count
 * can never disagree with the result set it claims to describe.
 *
 * `skip` omits one filter, which is what makes a facet usable: a brand facet computed
 * with the brand filter still applied would only ever show the brand already selected.
 */
function filterClauses(
  params: SearchQueryParams,
  bind: (value: unknown) => string,
  skip?: "brands",
): string[] {
  // Soft-deleted rows stay in the table; a search must never return one.
  const where: string[] = ["d.published = true", "d.deleted_at is null"];

  /*
   * The sales-channel boundary (ADR-022).
   *
   * Deliberately first, deliberately not skippable by the facet builder, and deliberately
   * sourced from the publishable key rather than from a query parameter. Medusa applies
   * this scoping to `/store/products` on its own; a derived index inherits none of it, so
   * without this clause one storefront's key reads the other storefront's catalogue.
   */
  if (params.salesChannelIds?.length) {
    where.push(
      `jsonb_exists_any(coalesce(d.sales_channel_ids, '[]'::jsonb), array[${params.salesChannelIds
        .map((id) => bind(id))
        .join(", ")}]::text[])`,
    );
  }

  if (params.categoryHandles?.length) {
    where.push(
      `jsonb_exists_any(coalesce(d.category_handles, '[]'::jsonb), array[${params.categoryHandles
        .map((handle) => bind(handle))
        .join(", ")}]::text[])`,
    );
  }

  if (skip !== "brands") {
    // The canonical handle is an indexed equality test. Free-text `brand` remains supported
    // for older links, but it is a case-folding scan over an unindexed column and it splits
    // Xiaomi into four brands, which is why nothing new should be built on it.
    if (params.brandHandles?.length) {
      where.push(
        `d.brand_handle in (${params.brandHandles.map((handle) => bind(handle)).join(", ")})`,
      );
    } else if (params.brands?.length) {
      where.push(
        `lower(coalesce(d.brand, '')) in (${params.brands.map((brand) => bind(brand.toLowerCase())).join(", ")})`,
      );
    }
  }

  if (params.priceMin != null) where.push(`d.price_pkr >= ${bind(params.priceMin)}`);
  if (params.priceMax != null) where.push(`d.price_pkr <= ${bind(params.priceMax)}`);
  if (params.inStockOnly) where.push("d.in_stock = true");

  // "What can I get for Rs 8,000 a month" is how a large share of this market shops, and
  // it is a range scan over an indexed column rather than a lookup per card only because
  // the cheapest monthly figure is denormalised onto the document (INST-003).
  if (params.hasInstallments) where.push("d.has_installments = true");
  if (params.monthlyMax != null) {
    where.push(`d.min_monthly_pkr is not null and d.min_monthly_pkr <= ${bind(params.monthlyMax)}`);
  }

  for (const [key, values] of Object.entries(params.attributes ?? {})) {
    if (values.length === 0) continue;
    // `jsonb_exists_any` rather than the `?|` operator: `?` is the placeholder character,
    // and escaping it inside a bound statement is a footgun waiting for the one query
    // nobody tests.
    where.push(
      `jsonb_exists_any(coalesce(d.attributes -> ${bind(key)}, '[]'::jsonb), array[${values
        .map((value) => bind(value))
        .join(", ")}]::text[])`,
    );
  }

  return where;
}


/**
 * Builds the scored subquery that both the result query and the facet query select from.
 *
 * Sharing one piece of SQL is not a tidiness preference: the bindings are positional, so
 * two builders that emit *almost* the same expressions will silently bind the wrong values
 * the first time one of them gains a clause. Emitting the identical inner query makes that
 * class of bug impossible, and it guarantees a facet count describes the set it claims to.
 */
function matchSubquery(
  params: SearchQueryParams,
  bind: (value: unknown) => string,
  options: { skipFilter?: "brands" } = {},
): { sql: string; hasQuery: boolean; normalizedQuery: string; tokens: string[] } {
  const normalizedQuery = normalizeText(params.q ?? "");
  const tokens = normalizedQuery ? tokenize(params.q) : [];
  const compact = compactAlphanumeric(params.q ?? "");
  const hasQuery = tokens.length > 0;

  // Every token the document literally contains, counted. Substring rather than prefix
  // matching: "1000xm6" should find "WH-1000XM6" even though it does not start the title.
  const tokenHits = hasQuery
    ? tokens
        .map((token) => `(case when d.search_text like ${bind(`%${token}%`)} then 1 else 0 end)`)
        .join(" + ")
    : "0";

  // The same count, but allowing each token to be misspelled.
  //
  // Matching is decided on this rather than on whole-query similarity: a query for
  // "iphone 15" should not match a 15-inch laptop just because the two strings share some
  // trigrams. The literal test comes first and short-circuits, so the expensive branch
  // only runs for tokens that genuinely did not appear.
  const fuzzyHits = hasQuery
    ? tokens
        .map((token) => {
          const budget = editBudget(token);
          const literal = `d.search_text like ${bind(`%${token}%`)}`;
          if (budget === 0) return `(case when ${literal} then 1 else 0 end)`;

          // Compared word by word rather than against the whole document: edit distance
          // between a token and a 200-character string is always large and tells us nothing.
          const fuzzy =
            `exists (select 1 from unnest(string_to_array(d.search_text, ' ')) as w` +
            ` where levenshtein_less_equal(w, ${bind(token)}, ${budget}) <= ${budget})`;

          return `(case when ${literal} then 1 when ${fuzzy} then 1 else 0 end)`;
        })
        .join(" + ")
    : "0";

  // Whole-query similarity. Used for ranking only — it orders near-misses sensibly but
  // decides nothing, because deciding on it is what produces irrelevant result sets.
  const trigram = hasQuery
    ? `greatest(similarity(d.search_text, ${bind(normalizedQuery)}), word_similarity(${bind(normalizedQuery)}, d.search_text))`
    : "0";

  // An exact identifier match is not a ranking nudge, it is the answer: someone typing a
  // SKU or a model number wants that product first, whatever else scores well.
  const identifierHit =
    hasQuery && looksLikeIdentifier(params.q)
      ? `(case when d.search_text like ${bind(`%${compact}%`)} or lower(coalesce(d.sku, '')) = ${bind(compact)} then 1 else 0 end)`
      : "0";

  const where = filterClauses(params, bind, options.skipFilter);

  // The weights are deliberately boring: the proportion of query tokens actually present
  // dominates, fuzzy similarity refines the ordering, an identifier match overrides both.
  // Popularity contributes least — a tie-break, never a way to float a product the
  // customer did not ask for (PRD section 8).
  //
  // The divisor is a token count this code computed rather than user input, so it is
  // interpolated; that keeps every remaining placeholder in strict textual order.
  const score = hasQuery
    ? `(token_hits::float / ${Math.max(1, tokens.length)}) * 0.5` +
      ` + (fuzzy_hits::float / ${Math.max(1, tokens.length)}) * 0.2` +
      ` + trigram_score * 0.2 + identifier_hit * 0.5 + popularity_score * 0.1`
    : "popularity_score";

  const sql = `
    select base.*, ${score} as score
    from (
      select d.*,
             (${tokenHits}) as token_hits,
             (${fuzzyHits}) as fuzzy_hits,
             ${trigram} as trigram_score,
             (${identifierHit}) as identifier_hit
      from search_document d
      where ${where.join(" and ")}
    ) as base
  `;

  return { sql, hasQuery, normalizedQuery, tokens };
}

export function buildSearchQuery(params: SearchQueryParams): BuiltQuery {
  const { bindings, bind } = binder();
  const inner = matchSubquery(params, bind);

  const order =
    params.sort === "price_asc"
      ? "price_pkr asc, score desc"
      : params.sort === "price_desc"
        ? "price_pkr desc, score desc"
        : params.sort === "newest"
          ? "product_created_at desc nulls last, score desc"
          : // Relevance: score, then genuine popularity, then the cheaper option, then id
            // — a deterministic tie-break so equal scores do not shuffle between requests.
            "score desc, popularity_score desc, price_pkr asc, id asc";

  const perPage = clamp(params.perPage ?? 24, 1, 60);
  const page = Math.max(1, params.page ?? 1);

  const sql = `
    select ${SELECTED_COLUMNS}, score, trigram_score, token_hits,
           count(*) over () as total_count
    from (${inner.sql}) as scored
    ${matchClause(inner.tokens.length)}
    order by ${order}
    limit ${perPage} offset ${(page - 1) * perPage}
  `;

  return { sql, bindings, normalizedQuery: inner.normalizedQuery, tokens: inner.tokens };
}

/**
 * Brand counts and price bounds over the matched set.
 *
 * Counted from the products the query actually returns, so a facet never offers a
 * combination that yields nothing (UX spec section 4). The brand filter is skipped while
 * counting brands — a brand facet computed with the brand filter applied would only ever
 * show the brand already selected.
 */
export function buildFacetQuery(params: SearchQueryParams): BuiltQuery {
  const { bindings, bind } = binder();
  const inner = matchSubquery(params, bind, { skipFilter: "brands" });

  const sql = `
    select brand, brand_handle,
           count(*)::int as count,
           min(price_pkr)::int as min_price,
           max(price_pkr)::int as max_price,
           sum(case when in_stock then 1 else 0 end)::int as in_stock_count
    from (${inner.sql}) as scored
    ${matchClause(inner.tokens.length)}
    group by brand, brand_handle
    order by count desc, brand asc
  `;

  return { sql, bindings, normalizedQuery: inner.normalizedQuery, tokens: inner.tokens };
}

/**
 * A document qualifies by containing every token of the query, allowing each one to be
 * misspelled.
 *
 * Requiring all tokens is what stops "iphone 15" returning every product whose title
 * happens to contain "15" — a fifteen-inch laptop is not a near miss for a phone, it is a
 * different question.
 */
function matchClause(tokenCount: number): string {
  if (tokenCount === 0) return "";
  return `where fuzzy_hits >= ${tokenCount}`;
}

/**
 * "Did you mean…" candidates.
 *
 * Only ever drawn from text that exists in the catalogue, so a suggestion always leads
 * somewhere — a suggestion that returns nothing is worse than no suggestion at all
 * (UX spec section 3).
 */
export function buildSuggestionQuery(q: string, limit = 3): BuiltQuery {
  const normalizedQuery = normalizeText(q);
  const bindings: unknown[] = [normalizedQuery, normalizedQuery, normalizedQuery, normalizedQuery];

  const sql = `
    select title, brand, model_name, handle,
           greatest(similarity(title, ?), similarity(coalesce(model_name, ''), ?)) as score
    from search_document
    where published = true
      and deleted_at is null
      and greatest(similarity(title, ?), similarity(coalesce(model_name, ''), ?)) > 0.2
    order by score desc
    limit ${clamp(limit, 1, 10)}
  `;

  return { sql, bindings, normalizedQuery, tokens: tokenize(q) };
}

/**
 * Autocomplete. Prefix matching ranks first because that is what a customer expects while
 * typing; trigram only fills the remaining slots, so an early keystroke never produces a
 * confident-looking wrong guess.
 */
export function buildAutocompleteQuery(
  q: string,
  limit = 8,
  salesChannelIds: string[] = [],
): BuiltQuery {
  const normalizedQuery = normalizeText(q);
  const compact = compactAlphanumeric(q);

  const bindings: unknown[] = [
    `${normalizedQuery}%`,
    `%${normalizedQuery}%`,
    `%${compact}%`,
    normalizedQuery,
    `%${normalizedQuery}%`,
    `%${compact}%`,
    normalizedQuery,
  ];

  /*
   * The same channel boundary search applies (ADR-022).
   *
   * Type-ahead is not a lesser surface: suggesting a product this storefront cannot sell
   * sends the customer to a 404 and leaks the other catalogue's product names one keystroke
   * at a time. The clause is appended after the ranking placeholders so the existing
   * positional bindings keep their order.
   */
  const channelClause = salesChannelIds.length
    ? ` and jsonb_exists_any(coalesce(sales_channel_ids, '[]'::jsonb), array[${salesChannelIds
        .map(() => "?")
        .join(", ")}]::text[])`
    : "";
  bindings.push(...salesChannelIds);

  const sql = `
    select id, title, handle, brand, thumbnail, price_pkr, in_stock,
           case
             when search_text like ? then 3
             when search_text like ? then 2
             when search_text like ? then 2
             else 1
           end as match_rank,
           similarity(search_text, ?) as trigram_score
    from search_document
    where published = true
      and deleted_at is null
      and (search_text like ? or search_text like ? or similarity(search_text, ?) >= ${TRIGRAM_THRESHOLD})
      ${channelClause}
    order by match_rank desc, trigram_score desc, in_stock desc, price_pkr asc
    limit ${clamp(limit, 1, 20)}
  `;

  return { sql, bindings, normalizedQuery, tokens: tokenize(q) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
