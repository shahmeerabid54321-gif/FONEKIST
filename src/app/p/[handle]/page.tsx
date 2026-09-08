import type { Metadata } from "next";
import { Suspense, type ComponentProps } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  boxContentsOf,
  brandOf,
  defaultVariant,
  getProductByHandle,
  getProductExtras,
  type MedusaProduct,
  modelOf,
  priceFor,
  stockLevelFor,
  type StockLevel,
} from "@/lib/catalog";
import { listPlans } from "@/lib/installments";
import { features } from "@/lib/features";
import { degradeGracefully } from "@/lib/log";
import { displayName } from "@/lib/product-name";
import { publicEnv } from "@/lib/env";
import { search } from "@/lib/search";
import { brandHandle } from "@/lib/brands";
import { dynamicRoute } from "@/lib/routes";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { SectionHead } from "@/components/storefront-blocks";
import { PlanSelector } from "@/components/plan-selector";
import { ProductGallery } from "@/components/product-gallery";
import { SpecTable } from "@/components/spec-table";
import { VariantSelector } from "@/components/variant-selector";
import { CompareToggle } from "@/components/compare-tray";
import { CatalogUnavailable } from "@/components/catalog-unavailable";
import { ProductSkeleton } from "@/components/skeletons";
import { getLiveStock } from "@/lib/catalog";
import { search as searchCatalog } from "@/lib/search";

/**
 * Which product pages are built ahead of time.
 *
 * A deliberately small slice rather than the whole catalogue. Pages named here are HTML on
 * disk and cost the server nothing; pages that are not still work, they get a shell and
 * stream. Since the build runs on a 0.1-CPU instance (see `experimental.cpus` in
 * `next.config.ts`), prerendering everything would trade a fast site for a build that does
 * not finish, so this takes the newest twenty and lets the long tail warm itself on first
 * visit.
 */
export async function generateStaticParams(): Promise<{ handle: string }[]> {
  const results = await degradeGracefully("pdp.staticParams", null, () =>
    searchCatalog({ q: "", sort: "newest", perPage: 20 }),
  );
  const handles = results?.hits.map((hit) => ({ handle: hit.slug })) ?? [];
  // Cache Components needs at least one param to prerender and validate against, and a
  // backend that is down at build time must not fail the build.
  return handles.length > 0 ? handles : [{ handle: "redmi-13c" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const product = await degradeGracefully("pdp.metadata", null, () =>
    getProductByHandle(handle),
  );
  if (!product) return { title: "Phone not found" };
  return {
    title: product.title,
    description: product.subtitle ?? product.description?.slice(0, 160) ?? undefined,
    alternates: { canonical: `/p/${product.handle}` },
  };
}

/**
 * The product page.
 *
 * **What is cached here and what is not.** The page body is cached for an hour: title,
 * images, specifications, price and the plan figures. That is a change from the `no-store`
 * this used to be, and the reasoning that made `no-store` right has moved rather than gone.
 * Presenting a price is not deciding one; commerce still decides, and
 * `submitApplicationAction` re-reads price and plans uncached at the moment an application
 * is actually made. What a customer browses is a catalogue, what they agree to is checked.
 *
 * The exception is the unit count. "Only 3 left" an hour after it was true is manufactured
 * scarcity, which this project forbids outright, so availability is read live through
 * `getLiveStock` in its own Suspense boundary and streams in after the rest of the page.
 *
 * Variant selection lives in the URL, so choosing 512 GB is a real navigation that can be
 * shared, bookmarked and reached with the back button, and it works with JavaScript
 * disabled.
 *
 * PTA status is stated twice on purpose: once beside the price, where the decision is made,
 * and once in the specification table. A handset sold unregistered is the most expensive
 * surprise in this market, and burying it in a spec row would be technically honest and
 * practically misleading.
 */
export default function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <Suspense fallback={<ProductSkeleton />}>
        <ProductBody params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProductBody({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  const query = await searchParams;

  /*
   * Three outcomes, and the difference between two of them matters.
   *
   * `null` is commerce saying there is no such handset, and it 404s. `undefined` is commerce
   * not answering, and it must never 404: retiring a URL somebody followed, because a
   * request failed, throws away the page and the link to it. That case renders the
   * unavailable state below.
   *
   * This page used to await the read bare, so any hiccup in commerce handed the whole thing
   * to the route error boundary: "We could not load this page" on every phone on the site,
   * while the catalogue pages either side of it degraded quietly. A product page is where
   * somebody arrives from a search result, and it was the one page with no cache to fall
   * back on, because it reads `no-store` to state a live price. That combination made it the
   * first thing to break and the loudest way to break.
   */
  const product = await degradeGracefully<MedusaProduct | null | undefined>(
    "pdp.product",
    undefined,
    () => getProductByHandle(handle),
  );
  if (product === null) notFound();

  const requested = typeof query.variant === "string" ? query.variant : null;
  const variant = product
    ? (product.variants.find((candidate) => candidate.id === requested) ??
      defaultVariant(product))
    : null;

  if (product && !variant) notFound();

  if (!product || !variant) {
    return <CatalogUnavailable retryHref={dynamicRoute(`/p/${handle}`)} />;
  }

  const brandForSearch = brandHandle(brandOf(product));

  const [extras, plans, related] = await Promise.all([
    /*
     * Degraded, but the page does not continue without it. The specification table carries
     * the PTA row, and a handset sold unregistered is the most expensive surprise in this
     * market: rendering the page with the table quietly missing would be the one failure
     * mode worse than saying we could not load it.
     */
    degradeGracefully("pdp.extras", null, () => getProductExtras(product.id, variant.id)),
    degradeGracefully("pdp.plans", [], () => listPlans(variant.id)),
    /*
     * Same brand, in stock. A page that ends at the specification table gives a reader who
     * has decided against this handset nowhere to go but the back button, and brand is the
     * axis this market actually shops along.
     *
     * Degraded rather than awaited hard: a missing rail is a quiet shelf, a throw here
     * would take down a page somebody is buying from.
     */
    brandForSearch
      ? degradeGracefully("pdp.related", null, () =>
          search({ q: "", brands: [brandForSearch], inStockOnly: true, perPage: 4 }),
        )
      : Promise.resolve(null),
  ]);

  if (!extras) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <CatalogUnavailable retryHref={dynamicRoute(`/p/${handle}`)} />
      </div>
    );
  }

  const price = priceFor(variant);
  const stock = stockLevelFor(variant);
  const brand = brandOf(product);
  const model = modelOf(product);
  const boxContents = boxContentsOf(product);

  const ptaSpec = extras.specs.find((spec) => spec.key === "pta_status");
  const notApproved = ptaSpec?.value?.toLowerCase().includes("not") ?? false;

  const outOfStock = stock.level === "out_of_stock";

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-[var(--text-muted)]">
        <Link href="/phones" className="underline">
          Phones
        </Link>
        {brand && (
          <>
            <span aria-hidden="true"> / </span>
            <Link href={`/brands/${brand.toLowerCase()}`} className="underline">
              {brand}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <ProductGallery images={product.images} title={product.title} />

        {/* Sticks beside the gallery on a wide screen, so price and buy stay in view. */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
            {brand ?? "Phone"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
            {displayName(product.title, brand)}
          </h1>
          {model && (
            <p className="mt-1.5 font-mono text-sm text-[var(--text-muted)]">
              Model {model}
              {variant.sku ? ` · ${variant.sku}` : ""}
            </p>
          )}
          {product.subtitle && (
            <p className="mt-3 text-[var(--text-soft)]">{product.subtitle}</p>
          )}

          {/*
            Stated where the decision is made, not only in the spec table. Somebody who
            discovers at the counter that a handset needs registering has already paid.
          */}
          {ptaSpec && (
            <p
              className={
                notApproved
                  ? "mt-5 rounded-[var(--radius-control)] border border-[var(--color-amber)] bg-[var(--color-amber-wash)] px-4 py-3 text-sm text-[var(--color-amber-ink)]"
                  : "mt-5 text-sm text-[var(--text-soft)]"
              }
            >
              {notApproved ? (
                <>
                  <strong className="font-semibold">Not PTA approved.</strong> Registration
                  duty is payable by you and is not in the price.{" "}
                  <Link href="/policies/pta" className="underline">
                    What this means
                  </Link>
                </>
              ) : (
                <>PTA approved. Registration duty is included in the price.</>
              )}
            </p>
          )}

          {/*
            The plans, or a plain statement that there are none.

            There is no cash fallback to render here any more. This site sells on
            installments only, so a handset with no authored plan is a handset that cannot
            be acquired today, and saying so is more use than a price nobody can pay.

            The listing is deliberately not filtered to hide it: which products FONEKIST may
            sell is decided by the sales channel upstream, and a second filter here would be
            a weaker copy of that rule (ADR-022).
          */}
          <div className="mt-7">
            {plans.length > 0 ? (
              <Suspense fallback={<p role="status">Checking availability...</p>}>
              <LivePlanSelector
                handle={product.handle}
                title={displayName(product.title, brand)}
                variantId={variant.id}
                plans={plans}
                disabled={outOfStock}
                disabledReason="Out of stock."
              />
              </Suspense>
            ) : (
              <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-sunken)] p-5">
                <p className="text-sm font-medium text-[var(--text)]">
                  This handset is not available on a plan yet.
                </p>
                <p className="mt-1.5 text-sm text-[var(--text-soft)]">
                  We sell on installments only, so there is nothing to apply for on this one
                  at the moment.
                </p>
                <Link
                  href={dynamicRoute("/phones?installments=1")}
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-[var(--line-strong)] px-5 text-sm font-medium text-[var(--text)]"
                >
                  See phones on a plan
                </Link>
              </div>
            )}
          </div>

          <div className="mt-7">
            <VariantSelector product={product} selectedVariant={variant} />
          </div>

          {/*
            Availability streams in rather than arriving with the page.

            Everything above this line is an hour-cached read, which is fine for a title and
            a price and is not fine for a unit count. The fallback states the cached *level*
            and no number: "In stock" is a claim the cache can still support, "Only 3 left"
            is not.
          */}
          <Suspense
            fallback={
              <StockLine
                level={stock.level}
                quantity={null}
                warranty={extras.warranty?.label ?? null}
              />
            }
          >
            <LiveStockLine
              handle={product.handle}
              variantId={variant.id}
              fallback={stock}
              warranty={extras.warranty?.label ?? null}
            />
          </Suspense>

          {/*
            The shortlist button, not a link that starts a comparison of one.

            The old control put this handle in `/compare?ids=` and left the customer to
            find the second phone with that URL still in their history, which is why
            comparisons were effectively never built. This adds the phone to a tray that
            follows them through the catalogue instead.
          */}
          {features.comparison && (
            <div className="mt-4">
              <CompareToggle handle={product.handle} />
            </div>
          )}

          {/*
            Three facts, one line each. This used to be three sentences of policy prose
            sitting between the buy button and the specifications, which is the worst
            possible place for something nobody reads until after they have decided.
          */}
          <dl className="mt-8 divide-y divide-[var(--line)] border-t border-[var(--line)] text-sm">
            <div className="flex items-baseline gap-4 py-3">
              <dt className="w-24 shrink-0 text-[var(--text-muted)]">Delivery</dt>
              <dd className="text-[var(--text-soft)]">
                Arranged once your application is approved.{" "}
                <Link href="/policies/delivery" className="underline">
                  Terms
                </Link>
              </dd>
            </div>
            <div className="flex items-baseline gap-4 py-3">
              <dt className="w-24 shrink-0 text-[var(--text-muted)]">Returns</dt>
              <dd className="text-[var(--text-soft)]">
                {publicEnv.NEXT_PUBLIC_RETURN_WINDOW_DAYS} days for a fault or a wrong item.{" "}
                <Link href="/policies/returns" className="underline">
                  Policy
                </Link>
              </dd>
            </div>
            {extras.warranty && (
              <div className="flex items-baseline gap-4 py-3">
                <dt className="w-24 shrink-0 text-[var(--text-muted)]">Warranty</dt>
                <dd className="text-[var(--text-soft)]">{extras.warranty.coverage_summary}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {product.description && (
        <section className="mt-16 max-w-3xl" aria-labelledby="about-heading">
          <h2 id="about-heading" className="text-xl font-semibold text-[var(--text)]">
            About this handset
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--text-soft)]">{product.description}</p>
        </section>
      )}

      {boxContents.length > 0 && (
        <section className="mt-12 max-w-3xl" aria-labelledby="box-heading">
          <h2 id="box-heading" className="text-xl font-semibold text-[var(--text)]">
            In the box
          </h2>
          <ul className="mt-4 space-y-1.5 text-[var(--text-soft)]">
            {boxContents.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-16" aria-labelledby="specs-heading">
        <h2 id="specs-heading" className="text-xl font-semibold text-[var(--text)]">
          Specifications
        </h2>
        <div className="mt-6">
          <SpecTable specs={extras.specs} />
        </div>
      </section>

      {related && related.hits.filter((hit) => hit.slug !== product.handle).length > 0 && (
        <section className="mt-16 border-t border-[var(--line)] pt-12" aria-labelledby="more-heading">
          <SectionHead
            id="more-heading"
            title={brand ? `More from ${brand}` : "More phones"}
            action={
              brandForSearch
                ? { label: "See all", href: `/brands/${brandForSearch}` }
                : { label: "All phones", href: "/phones" }
            }
          />
          <div className="mt-7">
            <ProductGrid
              products={related.hits
                .filter((hit) => hit.slug !== product.handle)
                .slice(0, 3)
                .map(hitToCard)}
            />
          </div>
        </section>
      )}

      {/*
        Product structured data. Only fields we actually hold: no aggregateRating, because
        there is no review data, and a fabricated rating in JSON-LD is a lie told to a
        search engine rather than to a customer, which is not an improvement.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.title,
            sku: variant.sku ?? undefined,
            mpn: model ?? undefined,
            brand: brand ? { "@type": "Brand", name: brand } : undefined,
            description: product.subtitle ?? undefined,
            offers: {
              "@type": "Offer",
              priceCurrency: "PKR",
              price: price.amount,
              availability: outOfStock
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
              url: `${publicEnv.NEXT_PUBLIC_SITE_URL}/p/${product.handle}`,
            },
          }),
        }}
      />

    </>
  );
}

/**
 * The availability line.
 *
 * Split out so the same markup serves the cached fallback and the live answer, and the two
 * cannot drift into saying things in different words.
 *
 * A quantity is printed only when one was actually counted. `quantity: null` means we have
 * a level but not a number, and the line then says "In stock" rather than inventing one.
 */
function StockLine({
  level,
  quantity,
  warranty,
}: {
  level: StockLevel;
  quantity: number | null;
  warranty: string | null;
}) {
  const availability =
    level === "out_of_stock"
      ? "Out of stock"
      : level === "low_stock" && quantity != null
        ? `Only ${quantity} left`
        : level === "preorder"
          ? "Available to order"
          : "In stock";

  return (
    <p className="mt-5 text-sm text-[var(--text-soft)]">
      {availability}
      {warranty ? ` \u00b7 ${warranty}` : ""}
    </p>
  );
}

/**
 * Reads inventory on every request, outside the hour-long cache the rest of this page uses.
 *
 * When commerce cannot be reached it falls back to the cached level with the count dropped,
 * which downgrades the claim instead of guessing at it.
 */
async function LiveStockLine({
  handle,
  variantId,
  fallback,
  warranty,
}: {
  handle: string;
  variantId: string;
  fallback: { level: StockLevel; quantity: number | null };
  warranty: string | null;
}) {
  const live = await getLiveStock(handle, variantId);
  return (
    <StockLine
      level={live?.level ?? fallback.level}
      quantity={live?.quantity ?? null}
      warranty={warranty}
    />
  );
}

/** Availability gates use the short-lived stock read, just like the availability label. */
async function LivePlanSelector(props: ComponentProps<typeof PlanSelector>) {
  const live = await getLiveStock(props.handle, props.variantId);
  return <PlanSelector {...props} disabled={!live || live.level === "out_of_stock"} disabledReason={live ? "Out of stock." : "Availability could not be confirmed. Please try again."} />;
}
