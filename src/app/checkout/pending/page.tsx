import Link from "next/link";
import type { Metadata } from "next";
import { formatPkr } from "@/lib/pk";
import { InlineAlert } from "@/components/ui";
import { getCart } from "@/lib/cart";
import { publicEnv } from "@/lib/env";
import { PendingPaymentCheck } from "@/components/pending-payment-check";

export const metadata: Metadata = {
  title: "Payment confirmation pending",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Payment confirmation pending. Source of truth: ADR-007, PAY-003, UX spec section 8.
 *
 * Reached when completing the cart did not resolve to an order — the provider has not
 * confirmed yet, or the request timed out. A timeout means *unknown*, not failed
 * (09_API_AND_EVENT_CONTRACTS.md section 13), so this page never says the payment failed
 * and never tells anyone to pay again. It re-checks the authoritative record instead.
 *
 * This route previously did not exist: the checkout action redirected here and the
 * customer landed on a 404 at the single worst moment in the flow — money possibly taken,
 * no order visible, no instruction.
 */
export default async function PendingPaymentPage() {
  const cart = await getCart();

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-semibold leading-[var(--leading-snug)] tracking-[-0.035em]">
          Payment confirmation pending
        </h1>

        <div className="mt-6">
          <InlineAlert tone="warning" title="We are waiting for your payment provider">
            Do not pay again. If money has left your account, this order will be created
            automatically once the provider confirms it, usually within a few minutes.
          </InlineAlert>
        </div>

        {cart && (
          <dl className="mt-6 flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Amount</dt>
              <dd className="font-mono">{formatPkr(cart.total)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[var(--text-muted)]">Items</dt>
              <dd className="font-mono">{cart.items.reduce((n, item) => n + item.quantity, 0)}</dd>
            </div>
          </dl>
        )}

        <div className="mt-8">
          <PendingPaymentCheck />
        </div>

        <section className="mt-10 rounded-[var(--radius-card)] bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line)]">
          <h2 className="text-lg font-semibold">
            If nothing changes
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>Wait a few minutes and check again. Provider confirmations can be slow.</li>
            <li>
              Check your email: if the order was created you will have a confirmation with its
              reference.
            </li>
            <li>Contact us before attempting a second payment, and we will check the provider.</li>
          </ul>

          <div className="mt-5 flex flex-wrap gap-3">
            {publicEnv.NEXT_PUBLIC_SUPPORT_PHONE && (
              <a
                href={`tel:${publicEnv.NEXT_PUBLIC_SUPPORT_PHONE}`}
                className="inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] bg-[var(--text)] px-6 font-medium text-[var(--surface)] transition-opacity  hover:opacity-90 active:scale-[0.98]"
              >
                Call support
              </a>
            )}
            <Link
              href="/track"
              className="inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] border border-[var(--line-strong)] px-6 transition-colors  hover:bg-[var(--surface-sunken)]"
            >
              Look up an order
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
