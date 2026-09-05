import type { Metadata } from "next";
import Link from "next/link";
import type { SearchFacet } from "@/lib/pk";
import { buildFilterQuery, parseFilters, SORT_OPTIONS } from "@/lib/filters";
import { search } from "@/lib/search";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { FilterPanel } from "@/components/filter-panel";
import { CatalogUnavailable } from "@/components/catalog-unavailable";
import { dynamicRoute } from "@/lib/routes";
import { degradeGracefully } from "@/lib/log";
import { features } from "@/lib/features";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: true },
};

/**
 * Search results.
 *
 * Two behaviours worth naming:
 *
 *  - **Suggestions are offered alongside results, not instead of them.** Somebody who typed
 *    a near-miss gets what matched *and* is told what the catalogue calls it, rather than
 *    silently receiving the corrected query's results and wondering why.
 *  - **An empty result set offers a route out.** A dead end with no next step is where a
 *    customer leaves.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const state = parseFilters(params);

  /*
   * A failed search is reported as a failure, never as an empty result set. "0 phones" for
   * a query the catalogue would have matched sends the customer away believing we do not
   * carry it, which is worse than admitting the shop is having a moment.
   */
  const results = await degradeGracefully("search.results", null, () =>
    search({
      q: query,
      brands: state.brands,
      priceMin: state.priceMin,
      priceMax: state.priceMax,
      inStockOnly: state.inStockOnly,
      monthlyMax: state.monthlyMax,
      installmentsOnly: state.installmentsOnly,
      attributes: state.attributes,
      sort: state.sort,
      page: state.page,
      perPage: 24,
    }),
  );

  if (!results) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
          {query ? `Results for "${query}"` : "Search"}
        </h1>
        <div className="mt-8">
          <CatalogUnavailable
            retryHref={dynamicRoute(`/search?${new URLSearchParams({ q: query }).toString()}`)}
          />
        </div>
      </div>
    );
  }

  const brandFacet: SearchFacet | null =
    results.facets.find((facet) => facet.key === "brand_handle") ?? null;
  const otherFacets = results.facets.filter((facet) => facet.key !== "brand_handle");

  const withQuery = (extra: Record<string, string>) => {
    const search = new URLSearchParams({ q: query, ...extra });
    return dynamicRoute(`/search?${search.toString()}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
          {query ? `Results for "${query}"` : "Search"}
        </h1>
        <p className="mt-2 font-mono text-sm text-[var(--text-muted)]" aria-live="polite">
          {results.total} {results.total === 1 ? "phone" : "phones"}
        </p>
      </header>

      {results.suggestions.length > 0 && (
        <p className="mt-4 text-sm text-[var(--text-soft)]">
          Did you mean{" "}
          {results.suggestions.map((suggestion, index) => (
            <span key={suggestion}>
              {index > 0 && ", "}
              <Link href={withQuery({})} className="underline">
                {suggestion}
              </Link>
            </span>
          ))}
          ?
        </p>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[16rem_1fr]">
        <aside>
          <h2 className="sr-only">Filters</h2>
          <FilterPanel
            state={state}
            facets={otherFacets}
            brandFacet={brandFacet}
            total={results.total}
          />
        </aside>

        <div>
          <nav aria-label="Sort" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {SORT_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={dynamicRoute(
                  `/search?q=${encodeURIComponent(query)}&${buildFilterQuery({
                    ...state,
                    sort: option.value,
                    page: 1,
                  }).replace(/^\?/, "")}`,
                )}
                aria-current={state.sort === option.value ? "true" : undefined}
                className={
                  state.sort === option.value
                    ? "text-sm font-medium text-[var(--text)]"
                    : "nav-pill nav-pill-flush inline-block text-sm text-[var(--text-soft)]"
                }
              >
                {option.label}
              </Link>
            ))}
          </nav>

          <div className="mt-6">
            {results.hits.length === 0 ? (
              <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-sunken)] p-8">
                <p className="text-[var(--text)]">
                  We do not have anything matching {query ? `"${query}"` : "that"}.
                </p>
                <p className="mt-2 text-sm text-[var(--text-soft)]">
                  Try a shorter search, or start from the full catalogue.
                </p>
                <Link
                  href="/phones"
                  className="mt-5 inline-flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-[var(--line-strong)] px-5 text-sm font-medium text-[var(--text)]"
                >
                  Browse all phones
                </Link>
              </div>
            ) : (
              <ProductGrid compare={features.comparison} products={results.hits.map(hitToCard)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
