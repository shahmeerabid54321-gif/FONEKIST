import Link from "next/link";
import type { Metadata } from "next";
import { formatPkr } from "@/lib/pk";
import { EmptyState } from "@/components/ui";
import { getCart } from "@/lib/cart";
import { publicEnv } from "@/lib/env";
import { CartLine } from "@/components/cart-line";
import { PromotionForm } from "@/components/promotion-form";
import { features } from "@/lib/features";
import { degradeGracefully } from "@/lib/log";
import { listPlans } from "@/lib/installments";
import { dynamicRoute } from "@/lib/routes";
import { IconCalendar } from "@/components/icons";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

// The cart is per-visitor state; it must never be prerendered or cached.
export const dynamic = "force-dynamic";

/**
 * Cart page. Source of truth: 05_UX_DESIGN_SPEC.md section 7.
 *
 * Every total shown here comes from commerce. The storefront does not add up line items
 * itself — doing so would let the page display a total the backend would not honour.
 */
export default async function CartPage() {
  const cart = await getCart();
  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16">
        <h1 className="sr-only">Your cart</h1>
        <EmptyState
          title="Your cart is empty"
          description="Every listing states its PTA status, warranty and stock before you buy."
          action={
            <Link
              href="/phones"
              className="inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] bg-[var(--text)] px-6 font-medium text-[var(--surface)] transition-opacity  hover:opacity-90 active:scale-[0.98]"
            >
              Start shopping
            </Link>
          }
        />
      </div>
    );
  }

  const shortfall = publicEnv.NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD_PKR - (cart?.subtotal ?? 0);

  /*
   * The other way to pay, offered where the decision is actually made.
   *
   * The cart and the checkout never mentioned installments at all, so a customer who added
   * a handset was on the cash rail with no way off it: to reach a plan they had to go back
   * to the product page and find a tab. This offers it beside Checkout, which is the moment
   * somebody is deciding how to pay for this specific phone.
   *
   * Offered only for a cart of exactly one handset, because that is what commerce will
   * accept: an agreement covers one handset at quantity one (INST-005), and a link that
   * leads to a rejection is worse than no link. It carries no monthly figure, because a
   * monthly figure never appears without its total (INST-003) and the total belongs on the
   * plan panel it links to.
   */
  const single = items.length === 1 && items[0]!.quantity === 1 ? items[0]! : null;
  const singleHandle = single?.product_handle ?? single?.variant?.product?.handle ?? null;

  const installmentPlans =
    features.installments && single && singleHandle
      ? await degradeGracefully("cart.plans", [], () => listPlans(single.variant_id))
      : [];

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8">
      <h1 className="text-3xl font-semibold leading-[var(--leading-snug)] tracking-[-0.035em]">
        Your cart
      </h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {items.map((item) => (
            <CartLine key={item.id} item={item} />
          ))}
        </ul>

        {/* Desktop uses a sticky summary; mobile stacks (UX spec section 8). */}
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="rounded-[var(--radius-card)] bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line)]">
            <h2 className="text-lg font-semibold">Order summary</h2>

            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <Row label="Subtotal" value={formatPkr(cart?.subtotal ?? 0)} />
              {(cart?.discount_total ?? 0) > 0 && (
                <Row label="Discount" value={`− ${formatPkr(cart!.discount_total)}`} />
              )}
              <Row
                label="Delivery"
                // Honest until we know the destination: no invented figure, and no
                // "FREE!" claim the checkout might contradict.
                value={
                  (cart?.shipping_total ?? 0) > 0
                    ? formatPkr(cart!.shipping_total)
                    : "Calculated at checkout"
                }
              />
              {(cart?.tax_total ?? 0) > 0 && <Row label="Tax" value={formatPkr(cart!.tax_total)} />}
            </dl>

            <div className="mt-4 flex items-baseline justify-between border-t border-[var(--line)] pt-4">
              <span className="font-semibold">Total</span>
              <span className="font-mono text-[length:var(--text-price-xl)] font-semibold">
                {formatPkr(cart?.total ?? 0)}
              </span>
            </div>

            <PromotionForm applied={cart?.promotions ?? []} />

            {shortfall > 0 && (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Add <span className="font-mono">{formatPkr(shortfall)}</span> more for free standard
                delivery.
              </p>
            )}

            <Link
              href="/checkout"
              className="mt-5 flex min-h-[52px] w-full items-center justify-center rounded-[var(--radius-chip)] bg-[var(--text)] px-6 text-[length:var(--text-body-lg)] font-medium text-[var(--surface)] transition-opacity  hover:opacity-90 active:scale-[0.98]"
            >
              Checkout
            </Link>

            {/* ADR-008: account creation never gates the purchase. */}
            <p className="mt-3 text-center text-sm text-[var(--text-muted)]">
              No account needed to order.
            </p>

            {installmentPlans.length > 0 && singleHandle && (
              <div className="mt-5 border-t border-[var(--line)] pt-5">
                <Link
                  href={dynamicRoute(
                    `/p/${singleHandle}?variant=${encodeURIComponent(single!.variant_id)}&pay=installments`,
                  )}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[var(--radius-chip)] border border-[var(--line-strong)] px-5 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-sunken)] active:scale-[0.98]"
                >
                  <IconCalendar />
                  Pay monthly instead
                </Link>
                <p className="mt-2.5 text-center text-xs leading-relaxed text-[var(--text-muted)]">
                  The advance, the monthly amount, the number of months and the total you
                  will pay are all shown before you apply. Nothing is charged when you apply.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
