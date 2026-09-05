import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { SearchFacet } from "@/lib/pk";
import { buildFilterQuery, parseFilters, SORT_OPTIONS, type FilterState } from "@/lib/filters";
import { cacheLife, cacheTag } from "next/cache";
import { search } from "@/lib/search";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { FilterPanel } from "@/components/filter-panel";
import { CatalogUnavailable } from "@/components/catalog-unavailable";
import { CatalogSkeleton, FilterPanelSkeleton } from "@/components/skeletons";
import { dynamicRoute } from "@/lib/routes";
import { degradeGracefully } from "@/lib/log";
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
 *
 * **Why the page function is not async.** The heading, the page frame and the two-column
 * layout do not depend on a single filter, so they are prerendered once and served from the
 * static shell. Only `PhonesResults` awaits `searchParams`, and it does that inside a
 * `<Suspense>` boundary, which is what lets the rest of the route be a static shell at all.
 * Awaiting the params up here instead would make the entire page wait on the customer's
 * request before a single byte could be sent, which is exactly what it used to do.
 */
export default function PhonesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
        All phones
      </h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr]">
        <Suspense
          fallback={
            <>
              <aside>
                <FilterPanelSkeleton />
              </aside>
              <div>
                <CatalogSkeleton />
              </div>
            </>
          }
        >
          <PhonesResults searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Resolves the URL, and nothing else.
 *
 * Kept separate and deliberately tiny so that the expensive half below can be cached. A
 * `use cache` scope may not read request data, so the request data is read here and handed
 * down as a plain value, which is also what makes it a cache key.
 */
async function PhonesResults({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <PhonesView state={parseFilters(params)} />;
}

/**
 * The results, cached as rendered output rather than as data.
 *
 * Caching the search response alone was not enough. The page still had to re-render
 * twenty-four cards, each with its own image, chips and icons, on every single request, and
 * that render was the cost: measured, the catalogue served about 85 requests a second while
 * a page with no such work served over a thousand. What is cached here is the finished
 * markup for one filter combination, so the second person to ask for the same view pays for
 * none of it.
 *
 * The key is `state`, the parsed filters, so every distinct combination gets its own entry
 * and no two views can be confused for each other. The hour matches the catalogue's profile
 * in `lib/search.ts`; there is no point rendering more often than the data changes.
 */
async function PhonesView({ state }: { state: FilterState }) {
  "use cache";
  cacheLife("hours");
  cacheTag("search");

  /*
   * Read through `degradeGracefully`, so a backend that is slow or restarting costs the
   * customer this one panel rather than the whole page. Before this, an unreachable
   * commerce threw here and the route error boundary replaced the catalogue with "We could
   * not load this page", which is the site's most important page gone over a timeout.
   */
  const results = await degradeGracefully("phones.search", null, () =>
    search({
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
    }),
  );

  if (!results) {
    // The heading and the frame are already on screen from the shell, so this fills the
    // results column and nothing else.
    return (
      <div className="lg:col-span-2">
        <CatalogUnavailable retryHref={dynamicRoute(`/phones${buildFilterQuery(state)}`)} />
      </div>
    );
  }

  const brandFacet: SearchFacet | null =
    results.facets.find((facet) => facet.key === "brand_handle") ?? null;
  const otherFacets = results.facets.filter((facet) => facet.key !== "brand_handle");

  const pageHref = (page: number) =>
    dynamicRoute(`/phones${buildFilterQuery({ ...state, page })}`);

  return (
    <>
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
    </>
  );
}
