import type { Metadata } from "next";
import { Photo } from "@/components/photo";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { brandHandle, formatPkr, type SearchFacet } from "@/lib/pk";
import { type Brand, getBrand } from "@/lib/brands";
import { buildFilterQuery, parseFilters, SORT_OPTIONS, type FilterState } from "@/lib/filters";
import { cacheLife, cacheTag } from "next/cache";
import { mediaUrl } from "@/lib/media";
import { features } from "@/lib/features";
import { search } from "@/lib/search";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { FilterPanel } from "@/components/filter-panel";
import { CatalogUnavailable } from "@/components/catalog-unavailable";
import { dynamicRoute } from "@/lib/routes";
import { degradeGracefully } from "@/lib/log";
import { listBrands } from "@/lib/brands";
import { CatalogSkeleton, FilterPanelSkeleton } from "@/components/skeletons";

/**
 * Which brand pages are built ahead of time.
 *
 * All of them, because there are a couple of dozen brands rather than a couple of thousand
 * products, and these are the site's second-biggest entry point after the home page. A brand
 * page that is already HTML on disk costs the server nothing to serve, which is the whole
 * point of the exercise.
 *
 * A handle that is not in this list is not a 404: Next serves it a shell and streams the
 * rest, so a brand added upstream between deploys still works, just without the head start.
 * The fallback of one entry matters because Cache Components requires at least one param to
 * prerender against, and a brand list that fails to load must not fail the build.
 */
export async function generateStaticParams(): Promise<{ handle: string }[]> {
  const brands = await degradeGracefully("brand.staticParams", [], () => listBrands());
  if (brands.length === 0) return [{ handle: "samsung" }];
  return brands.map((brand) => ({ handle: brand.handle }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const brand = await degradeGracefully("brand.metadata", null, () => getBrand(handle));
  if (!brand) return { title: "Brand not found" };
  return {
    title: brand.name,
    description:
      brand.description ??
      `Every ${brand.name} handset we carry, with PTA status, warranty and installment plans.`,
  };
}

/**
 * A brand page.
 *
 * These pages are the site's second-biggest entry point after the home page, because this
 * market shops brand-first, and they used to open with a heading and a sidebar: the same
 * page as `/phones` with one filter pre-applied and nothing to say for itself.
 *
 * It now opens with a band carrying the brand's own name over a handset it actually sells,
 * and three figures a shopper is deciding on: how many models, the cheapest cash price and
 * the cheapest monthly plan. Those are read from the same query that fills the grid, so
 * they cannot drift from it and cost no extra request.
 *
 * The URL segment is normalised through `brandHandle` before anything is looked up, and a
 * request for a sub-brand redirects to its parent. `/brands/redmi` is a URL customers
 * genuinely type and share, and answering it with a 404 because our canonical name is
 * `xiaomi` would be pedantry at the customer's expense. A redirect rather than a silent
 * render, so there is one canonical URL for search engines and for a shared link.
 *
 * **The shell and the body.** Everything below the frame depends on which brand this is,
 * and that is only known from `params`. Awaiting it at the top of the page would mean no
 * part of the route could be prerendered, so the page function itself is synchronous and
 * hands the promise to a suspended child. What ships instantly is the page frame and a
 * placeholder the right shape; the band and the grid stream into it.
 */
export default function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<BrandPageSkeleton />}>
      <BrandBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function BrandPageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_1fr]">
        <aside>
          <FilterPanelSkeleton />
        </aside>
        <CatalogSkeleton />
      </div>
    </div>
  );
}

/**
 * Resolves the URL, then hands plain values to the cached view below.
 *
 * The redirect stays here rather than inside the cache: a redirect is an action taken on one
 * request, not a piece of output worth keeping, and `use cache` scopes may not read request
 * data anyway.
 */
async function BrandBody({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  const canonical = brandHandle(handle);

  if (canonical && canonical !== handle.toLowerCase()) {
    redirect(`/brands/${canonical}`);
  }

  return <BrandView handle={handle} canonical={canonical} state={parseFilters(await searchParams)} />;
}

/**
 * A brand's page, cached as rendered markup.
 *
 * Same reasoning as the catalogue: caching the search response still left twenty-four cards
 * to render per request, and the render was the expense. Keyed by the brand and the filter
 * state together, so two brands never share an entry.
 */
async function BrandView({
  handle,
  canonical,
  state,
}: {
  handle: string;
  canonical: string | null;
  state: FilterState;
}) {
  "use cache";
  cacheLife("hours");
  cacheTag(`brand:${canonical ?? handle}`);

  /*
   * Three outcomes, and they must not be confused with each other.
   *
   * `null` is the backend answering that there is no such brand, and it 404s. `undefined` is
   * the backend not answering at all, and it must not: telling somebody who followed a link
   * to `/brands/samsung` that the page does not exist, because a request timed out, retires
   * a URL that is fine. That case falls through to the unavailable state below.
   */
  const brand = await degradeGracefully<Brand | null | undefined>(
    "brand.detail",
    undefined,
    () => getBrand(handle),
  );
  if (brand === null) notFound();

  const results = brand
    ? await degradeGracefully("brand.search", null, () =>
        search({
          q: "",
          // The brand comes from the route, not from the filter panel, so it cannot be
          // removed from within the page and silently turn a brand page into the whole
          // catalogue.
          brands: [brand.handle],
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
      )
    : null;

  if (!brand || !results) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
          {brand?.name ?? "This brand"}
        </h1>
        <div className="mt-8">
          <CatalogUnavailable retryHref={dynamicRoute(`/brands/${canonical ?? handle}`)} />
        </div>
      </div>
    );
  }

  // The brand facet is suppressed here: on a brand page it can only ever offer the brand
  // already being viewed.
  const facets: SearchFacet[] = results.facets.filter((facet) => facet.key !== "brand_handle");

  /*
   * The band's figures and its photograph, taken from the hits already in hand.
   *
   * They describe the current result set, so with a filter applied they describe what is
   * being shown rather than the brand in the abstract. That is the honest reading: a
   * "from Rs 42,999" printed above a grid filtered to flagships would be a figure for
   * phones the reader cannot see.
   */
  const cheapestCash = results.hits.map((hit) => hit.price_pkr).sort((a, b) => a - b)[0] ?? null;
  const cheapestMonthly =
    results.hits
      .map((hit) => hit.min_monthly_pkr)
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b)[0] ?? null;
  const bannerImage = mediaUrl(results.hits.find((hit) => hit.thumbnail)?.thumbnail ?? null);

  const filtered =
    state.brands.length > 0 ||
    state.priceMin != null ||
    state.priceMax != null ||
    state.monthlyMax != null ||
    state.installmentsOnly ||
    state.inStockOnly ||
    Object.keys(state.attributes).length > 0;

  const sortHref = (sort: (typeof SORT_OPTIONS)[number]["value"]) =>
    dynamicRoute(
      `/brands/${brand.handle}${buildFilterQuery({ ...state, brands: [], sort, page: 1 })}`,
    );

  return (
    <div>
      <section className="on-inverse relative overflow-hidden">
        {bannerImage && (
          <Photo
            src={bannerImage}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-right"
          />
        )}
        {/* The photograph is real and its left side is not reliably dark, so the type sits
            on a scrim rather than on whatever the picture happens to be. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[var(--surface-inverse)] via-[var(--surface-inverse)]/92 to-[var(--surface-inverse)]/25"
        />

        <div className="relative mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <nav aria-label="Breadcrumb" className="text-sm text-[var(--on-inverse-muted)]">
            <Link href="/phones" className="nav-pill nav-pill-flush inline-block">
              Phones
            </Link>
            <span aria-hidden="true"> / </span>
            <Link href="/brands" className="nav-pill inline-block">
              Brands
            </Link>
          </nav>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-[var(--on-inverse)] sm:text-6xl">
            {brand.name}
          </h1>
          {brand.description && (
            <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--on-inverse-soft)]">
              {brand.description}
            </p>
          )}

          {results.total > 0 && (
            <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-5">
              <div>
                <dt className="brand-eyebrow text-[var(--on-inverse-muted)]">
                  {filtered ? "Matching" : "Models"}
                </dt>
                <dd className="mt-1 text-2xl font-semibold text-[var(--on-inverse)]">{results.total}</dd>
              </div>
              {cheapestCash != null && (
                <div>
                  <dt className="brand-eyebrow text-[var(--on-inverse-muted)]">From</dt>
                  <dd className="mt-1 text-2xl font-semibold text-[var(--on-inverse)]">
                    {formatPkr(cheapestCash)}
                  </dd>
                </div>
              )}
              {cheapestMonthly != null && (
                <div>
                  <dt className="brand-eyebrow text-[var(--on-inverse-muted)]">
                    Or monthly from
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-[var(--color-emerald-strong)]">
                    {formatPkr(cheapestMonthly)}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {cheapestMonthly != null && (
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={dynamicRoute(`/brands/${brand.handle}?installments=1&in_stock=1`)}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-[var(--radius-chip)] bg-[var(--brand-paper)] px-7 text-sm font-semibold text-[var(--brand-ink)] transition-transform duration-300 [transition-timing-function:var(--ease-brand)] hover:scale-[1.02]"
              >
                On a monthly plan
              </Link>
              <Link
                href={dynamicRoute(`/brands/${brand.handle}?in_stock=1`)}
                className="inline-flex min-h-[48px] items-center rounded-[var(--radius-chip)] border border-[var(--line-strong)] px-7 text-sm font-medium text-[var(--text)] transition-colors hover:border-[var(--on-inverse)]"
              >
                In stock now
              </Link>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
          <aside>
            <h2 className="sr-only">Filters</h2>
            <FilterPanel
              state={{ ...state, brands: [] }}
              facets={facets}
              brandFacet={null}
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
                    href={sortHref(option.value)}
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

            <div className="mt-7">
              <ProductGrid
                compare={features.comparison}
                products={results.hits.map(hitToCard)}
                emptyMessage={`We do not have any ${brand.name} phones matching these filters right now.`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
