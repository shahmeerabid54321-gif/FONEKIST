import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { brandOf, getProductByHandle, stockLevelFor } from "@/lib/catalog";
import { listPlans, type PlanView } from "@/lib/installments";
import { degradeGracefully } from "@/lib/log";
import { mediaUrl } from "@/lib/media";
import { displayName } from "@/lib/product-name";
import { readQuery, MAX_QUERY, type QueryEntry } from "@/lib/query";
import { dynamicRoute } from "@/lib/routes";
import { InstallmentDisclosure } from "@/components/installment-disclosure";
import { ClearQueryButton, RemoveFromQueryButton } from "@/components/query-actions";
import { EmptyState } from "@/components/ui";
import { IconCalendar } from "@/components/icons";

export const metadata: Metadata = {
  title: "Your query",
  description: "The phones and plans you are considering, with the total for each.",
};

/**
 * The query.
 *
 * This is where a cart would be on a shop that sold things. Nothing is bought here: the page
 * holds the handsets somebody is choosing between and the plan they picked for each, and
 * every row offers the one action that exists on this site, which is to apply.
 *
 * **Every figure is read fresh.** The cookie holds three identifiers per row and no money.
 * Prices, stock and plans all come from commerce at render time, so a shortlist left open
 * for a week cannot quote a figure the backend has since changed (ADR-014).
 *
 * A row whose plan has gone is shown as a row that lost its plan, with the plans that do
 * exist offered beside it. It is never dropped silently and never re-pointed at a different
 * plan, because both of those change what the customer chose without telling them.
 */
export const dynamic = "force-dynamic";

interface ResolvedRow {
  entry: QueryEntry;
  brand: string | null;
  title: string;
  thumbnail: string | null;
  variantTitle: string | null;
  outOfStock: boolean;
  plan: PlanView | null;
  alternatives: PlanView[];
}

async function resolve(entry: QueryEntry): Promise<ResolvedRow | null> {
  const product = await degradeGracefully("query.product", null, () =>
    getProductByHandle(entry.h),
  );
  if (!product) return null;

  const variant = product.variants.find((candidate) => candidate.id === entry.v);
  if (!variant) return null;

  const plans = await degradeGracefully("query.plans", [], () => listPlans(entry.v));

  const brand = brandOf(product);

  return {
    entry,
    brand,
    title: displayName(product.title, brand),
    thumbnail: mediaUrl(product.thumbnail),
    variantTitle: variant.title || null,
    outOfStock: stockLevelFor(variant).level === "out_of_stock",
    plan: plans.find((candidate) => candidate.id === entry.p) ?? null,
    alternatives: plans,
  };
}

export default async function QueryPage() {
  const entries = await readQuery();

  const resolved = (await Promise.all(entries.map(resolve))).filter(
    (row): row is ResolvedRow => row !== null,
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Your query</h1>
        {resolved.length > 0 && <ClearQueryButton />}
      </div>

      {resolved.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing on your query yet"
            description="Add a phone and the plan you want, and it waits here while you look at the others."
            action={
              <Link
                href="/phones"
                className="inline-flex min-h-[44px] items-center rounded-[var(--radius-control)] bg-[var(--text)] px-5 text-sm font-semibold text-[var(--surface)]"
              >
                Browse phones
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <p className="mt-3 text-[var(--text-soft)]">
            {resolved.length === 1
              ? "One phone, with the full cost of its plan."
              : `${resolved.length} phones, with the full cost of each plan.`}{" "}
            An agreement covers one handset, so choose the one you want and apply for it.
          </p>

          <ul className="mt-8 space-y-8">
            {resolved.map((row) => {
              const productHref = dynamicRoute(
                `/p/${row.entry.h}?variant=${encodeURIComponent(row.entry.v)}`,
              );

              return (
                <li
                  key={row.entry.v}
                  className="rounded-[var(--radius-card)] border border-[var(--line)] p-5 sm:p-6"
                >
                  <div className="flex gap-5">
                    <Link
                      href={productHref}
                      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-tile)]"
                    >
                      {row.thumbnail && (
                        <Image src={row.thumbnail} alt="" fill sizes="96px" className="object-cover" />
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      {/*
                        The brand, above the name. `displayName` strips the brand from the
                        title because the product page prints it as an eyebrow just above,
                        and without that eyebrow a row here reads "C65" with no maker on it.
                      */}
                      {row.brand && (
                        <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
                          {row.brand}
                        </p>
                      )}
                      <h2 className="mt-1 text-lg font-semibold text-[var(--text)]">
                        <Link href={productHref} className="hover:underline">
                          {row.title}
                        </Link>
                      </h2>
                      {row.variantTitle && (
                        <p className="mt-1 font-mono text-sm text-[var(--text-muted)]">
                          {row.variantTitle}
                        </p>
                      )}
                      {row.outOfStock && (
                        <p className="mt-2 text-sm text-[var(--color-amber-ink)]">
                          Out of stock. We cannot hold this handset for an application right now.
                        </p>
                      )}
                    </div>
                  </div>

                  {row.plan ? (
                    <>
                      <div className="mt-5">
                        <InstallmentDisclosure plan={row.plan} />
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        {!row.outOfStock && (
                          <Link
                            href={dynamicRoute(
                              `/installments/apply?variant=${encodeURIComponent(row.entry.v)}&plan=${encodeURIComponent(row.plan.id)}`,
                            )}
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-control)] bg-[var(--text)] px-5 text-sm font-semibold text-[var(--surface)] transition-opacity duration-200 [transition-timing-function:var(--ease-brand)] hover:opacity-90"
                          >
                            <IconCalendar />
                            Apply for this plan
                          </Link>
                        )}
                        <RemoveFromQueryButton variantId={row.entry.v} />
                      </div>
                    </>
                  ) : (
                    /*
                      The plan went away between shortlisting and now.

                      Said plainly, with the plans that do exist offered as a link rather
                      than swapped in. Quietly moving the customer onto a different plan
                      would change the figures they chose without telling them, which is the
                      exact thing this storefront is built not to do.
                    */
                    <div className="mt-5 rounded-[var(--radius-control)] border border-[var(--color-amber)] bg-[var(--color-amber-wash)] px-4 py-3 text-sm text-[var(--color-amber-ink)]">
                      <p className="font-medium">This plan is no longer available.</p>
                      {row.alternatives.length > 0 ? (
                        <p className="mt-1">
                          There{" "}
                          {row.alternatives.length === 1
                            ? "is 1 other plan"
                            : `are ${row.alternatives.length} other plans`}{" "}
                          on this handset.{" "}
                          <Link href={productHref} className="underline">
                            Choose one
                          </Link>
                        </p>
                      ) : (
                        <p className="mt-1">
                          This handset is not available on a plan at the moment.
                        </p>
                      )}
                      <div className="mt-3">
                        <RemoveFromQueryButton variantId={row.entry.v} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-8 text-sm text-[var(--text-muted)]">
            A query holds up to {MAX_QUERY} phones. Nothing is charged, reserved or ordered
            here. The handset is held only once an application is submitted.
          </p>
        </>
      )}
    </div>
  );
}
