import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  boxContentsOf,
  brandOf,
  defaultVariant,
  getProductByHandle,
  getProductExtras,
  modelOf,
  priceFor,
  stockLevelFor,
} from "@/lib/catalog";
import { listPlans } from "@/lib/installments";
import { features } from "@/lib/features";
import { degradeGracefully } from "@/lib/log";
import { displayName } from "@/lib/product-name";
import { publicEnv } from "@/lib/env";
import { search } from "@/lib/search";
import { brandHandle } from "@/lib/brands";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { SectionHead } from "@/components/storefront-blocks";
import { AddToCartForm } from "@/components/add-to-cart-form";
import { PlanSelector } from "@/components/plan-selector";
import { Price } from "@/components/price";
import { ProductGallery } from "@/components/product-gallery";
import { SpecTable } from "@/components/spec-table";
import { VariantSelector } from "@/components/variant-selector";
import { CompareToggle } from "@/components/compare-tray";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const product = await getProductByHandle(handle);
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
 * Read fresh, never cached: this page states the price, the stock and the plan somebody is
 * about to agree to. A card may lag the catalogue by a minute (ADR-014); this may not.
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
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  const query = await searchParams;

  const product = await getProductByHandle(handle);
  if (!product) notFound();

  const requested = typeof query.variant === "string" ? query.variant : null;
  const variant =
    product.variants.find((candidate) => candidate.id === requested) ?? defaultVariant(product);

  if (!variant) notFound();

  const brandForSearch = brandHandle(brandOf(product));

  const [extras, plans, related] = await Promise.all([
    getProductExtras(product.id, variant.id),
    features.installments
      ? degradeGracefully("pdp.plans", [], () => listPlans(variant.id))
      : Promise.resolve([]),
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

  const price = priceFor(variant);
  const stock = stockLevelFor(variant);
  const brand = brandOf(product);
  const model = modelOf(product);
  const boxContents = boxContentsOf(product);

  const ptaSpec = extras.specs.find((spec) => spec.key === "pta_status");
  const notApproved = ptaSpec?.value?.toLowerCase().includes("not") ?? false;

  const outOfStock = stock.level === "out_of_stock";

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
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

          <div className="mt-7">
            {features.installments && plans.length > 0 ? (
              <PlanSelector
                variantId={variant.id}
                cashPrice={price.amount}
                compareAt={price.compareAt}
                plans={plans}
                /*
                 * `?pay=installments` opens the panel on the plans.
                 *
                 * It is set by the things a customer presses to say that is how they intend
                 * to buy: the monthly line on a card, the installments rails on the home
                 * page, the listing filtered to plans. Arriving at a product page any other
                 * way still opens on the cash price, which is the rule that matters.
                 */
                initialMode={query.pay === "installments" ? "installments" : "cash"}
              />
            ) : (
              <Price amount={price.amount} compareAt={price.compareAt} size="large" />
            )}
          </div>

          <div className="mt-7">
            <VariantSelector product={product} selectedVariant={variant} />
          </div>

          <p className="mt-5 text-sm text-[var(--text-soft)]">
            {outOfStock
              ? "Out of stock"
              : stock.level === "low_stock" && stock.quantity != null
                ? `Only ${stock.quantity} left`
                : stock.level === "preorder"
                  ? "Available to order"
                  : "In stock"}
            {extras.warranty ? ` · ${extras.warranty.label}` : ""}
          </p>

          <div className="mt-5">
            <AddToCartForm
              variantId={variant.id}
              disabled={outOfStock}
              disabledReason="Out of stock"
            />
          </div>

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
                Estimate and cost at checkout.{" "}
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

    </div>
  );
}
