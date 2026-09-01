import type { Metadata } from "next";
import Link from "next/link";
import type { SearchFacet } from "@/lib/pk";
import { buildFilterQuery, parseFilters, SORT_OPTIONS } from "@/lib/filters";
import { search } from "@/lib/search";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { FilterPanel } from "@/components/filter-panel";
import { dynamicRoute } from "@/lib/routes";
import { features } from "@/lib/features";

export const metadata: Metadata = {
  title: "All phones",
  description:
    "Every phone we carry, with PTA status, warranty, stock and installment plans stated on each listing.",
};

/**
 * The catalogue.
 *
 * Filter state comes from the URL and only from the URL (`parseFilters`), so the back
 * button works, a filtered view is shareable, and reloading returns the same page. That is
 * the whole reason the filter controls are links rather than form state.
 *
 * Nothing on this page filters for phones. It does not need to: every request carries the
 * FONEKIST publishable key and that channel holds phones and nothing else (ADR-022). A
 * category filter here would be a second, weaker copy of that rule.
 */
export default async function PhonesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const state = parseFilters(params);

  const results = await search({
    q: "",
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
  });

  const brandFacet: SearchFacet | null =
    results.facets.find((facet) => facet.key === "brand_handle") ?? null;
  const otherFacets = results.facets.filter((facet) => facet.key !== "brand_handle");

  const pageHref = (page: number) =>
    dynamicRoute(`/phones${buildFilterQuery({ ...state, page })}`);

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
        All phones
      </h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr]">
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-sm text-[var(--text-muted)]" aria-live="polite">
              {results.total} {results.total === 1 ? "phone" : "phones"}
            </p>
            <nav aria-label="Sort" className="flex flex-wrap items-center gap-2">
              {SORT_OPTIONS.map((option) => (
                <Link
                  key={option.value}
                  href={dynamicRoute(
                    `/phones${buildFilterQuery({ ...state, sort: option.value, page: 1 })}`,
                  )}
                  aria-current={state.sort === option.value ? "true" : undefined}
                  className={
                    state.sort === option.value
                      ? "inline-flex min-h-[40px] items-center rounded-[var(--radius-chip)] bg-[var(--text)] px-4 text-sm font-medium text-[var(--surface)]"
                      : "nav-pill inline-flex min-h-[40px] items-center bg-[var(--surface-tile)] px-4 text-sm text-[var(--text-soft)]"
                  }
                >
                  {option.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="mt-6">
            <ProductGrid
                compare={features.comparison}
              products={results.hits.map(hitToCard)}
              emptyMessage="No phones match these filters. Try removing one."
            />
          </div>

          {results.total_pages > 1 && (
            <nav aria-label="Pagination" className="mt-10 flex items-center justify-between gap-4">
              {state.page > 1 ? (
                <Link
                  href={pageHref(state.page - 1)}
                  className="inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] border border-[var(--line)] px-6 text-sm font-medium text-[var(--text)]"
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <p className="font-mono text-sm text-[var(--text-muted)]">
                Page {results.page} of {results.total_pages}
              </p>
              {state.page < results.total_pages ? (
                <Link
                  href={pageHref(state.page + 1)}
                  className="inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] border border-[var(--line)] px-6 text-sm font-medium text-[var(--text)]"
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
