import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { formatPkr, formatPkMobile } from "@/lib/pk";
import { InlineAlert } from "@/components/ui";
import { buildTrackingView, getOrder, isCodOrder, paymentStatusCopy, returnsMayApply } from "@/lib/orders";
import { publicEnv } from "@/lib/env";
import { RETURN_WINDOW_DAYS } from "@/lib/policies";
import { ReturnRequestForm } from "@/components/return-request-form";
import { BrandPip, SignalProgress } from "@/components/brand/signal-arc";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Order confirmation and status. Source of truth: 05_UX_DESIGN_SPEC.md sections 9 and 10.
 *
 * Shows the order reference, amount, payment state, delivery method, address summary, the
 * next step, a track CTA and support details.
 *
 * ADR-007 / PAY-003: the `?placed=1` parameter only changes the wording of the heading.
 * Payment state is read from the order record, so editing the URL cannot make an unpaid
 * order look paid.
 */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { id } = await params;
  const { placed } = await searchParams;

  const order = await getOrder(id);
  if (!order) notFound();

  const payment = paymentStatusCopy(order);
  const tracking = buildTrackingView(order);
  const cod = isCodOrder(order);
  const address = order.shipping_address;

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold leading-[var(--leading-snug)] tracking-[-0.035em]">
          {placed === "1" ? "Thank you. Your order is placed." : "Your order"}
        </h1>

        <p className="mt-3 text-[length:var(--text-body-lg)]">
          Order reference{" "}
          <span className="font-mono font-semibold">#{order.display_id}</span>
        </p>
        <p className="mt-1 text-[var(--text-muted)]">
          A confirmation has been sent to {order.email}.
        </p>

        <div className="mt-6">
          <InlineAlert tone={payment.tone} title={payment.text}>
            {cod
              ? `Pay ${formatPkr(order.total)} in cash to the courier when your order arrives. We may call to confirm the order before dispatch.`
              : payment.tone === "warning"
                ? "We are waiting for confirmation from the payment provider. Do not pay again. This page updates once the payment is confirmed."
                : `We received ${formatPkr(order.total)} for this order.`}
          </InlineAlert>
        </div>

        {/* Canonical customer-facing timeline (UX spec section 10). */}
        <section aria-labelledby="status-heading" className="mt-10">
          <h2 id="status-heading" className="flex items-center gap-2.5 text-lg font-semibold">
            <BrandPip />
            Status
          </h2>
          {/*
            The shared step track (ADR-003), the same one the phone finder, checkout and the
            credit application use. It replaces a hand-rolled list whose reached nodes were
            painted with `--color-success`, a token that is not defined anywhere and
            therefore rendered as no colour at all: the timeline had been showing every step
            identically for as long as it has existed.

            `current` is the last reached step, and `complete` covers a delivered order,
            where there is no step still in progress.
          */}
          <SignalProgress
            className="mt-5"
            orientation="vertical"
            steps={tracking.timeline.map((step) => ({ label: step.label }))}
            current={Math.max(
              0,
              tracking.timeline.findIndex((step) => step.current),
            )}
            complete={tracking.timeline.every((step) => step.reached)}
          />

          {tracking.trackingNumber && (
            <p className="mt-2 text-sm">
              Tracking number <span className="font-mono">{tracking.trackingNumber}</span>
              {tracking.trackingUrl && (
                <>
                  {" · "}
                  <a href={tracking.trackingUrl} className="underline underline-offset-4">
                    Track with the courier
                  </a>
                </>
              )}
            </p>
          )}
        </section>

        <section aria-labelledby="items-heading" className="mt-10">
          <h2 id="items-heading" className="text-lg font-semibold">
            Items
          </h2>
          <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {order.items.map((item) => (
              <li key={item.id} className="flex gap-4 py-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-sunken)]">
                  {item.thumbnail && (
                    <Image
                      src={item.thumbnail}
                      alt=""
                      aria-hidden="true"
                      width={64}
                      height={64}
                      className="h-full w-full object-contain p-1"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  {item.variant?.title && (
                    <p className="text-sm text-[var(--text-muted)]">
                      {item.variant.title}
                      {item.variant.sku && ` · SKU ${item.variant.sku}`}
                    </p>
                  )}
                  <p className="text-sm text-[var(--text-muted)]">
                    Qty {item.quantity}
                  </p>
                </div>
                <p className="font-mono font-medium">{formatPkr(item.total)}</p>
              </li>
            ))}
          </ul>

          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <Row label="Subtotal" value={formatPkr(order.subtotal)} />
            {order.discount_total > 0 && <Row label="Discount" value={`− ${formatPkr(order.discount_total)}`} />}
            <Row
              label={order.shipping_methods[0]?.name ?? "Delivery"}
              value={order.shipping_total === 0 ? "Free" : formatPkr(order.shipping_total)}
            />
            {order.tax_total > 0 && <Row label="Tax" value={formatPkr(order.tax_total)} />}
          </dl>

          <div className="mt-3 flex items-baseline justify-between border-t border-[var(--line)] pt-3">
            <span className="font-semibold">Total</span>
            <span className="font-mono text-[length:var(--text-price-xl)] font-semibold">
              {formatPkr(order.total)}
            </span>
          </div>
        </section>

        {address && (
          <section aria-labelledby="address-heading" className="mt-10">
            <h2 id="address-heading" className="text-lg font-semibold">
              Delivery address
            </h2>
            <address className="mt-3 not-italic text-[var(--text-muted)]">
              {[address.first_name, address.last_name].filter(Boolean).join(" ")}
              <br />
              {address.address_1}
              {address.address_2 && (
                <>
                  <br />
                  {address.address_2}
                </>
              )}
              <br />
              {[address.city, address.province].filter(Boolean).join(", ")}
              {address.phone && (
                <>
                  <br />
                  {formatPkMobile(address.phone)}
                </>
              )}
            </address>
          </section>
        )}

        <section className="mt-10 rounded-[var(--radius-card)] bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line)]">
          <h2 className="text-lg font-semibold">What happens next</h2>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              {cod
                ? "We confirm your order by phone, then dispatch it from Karachi."
                : "Once payment is confirmed we prepare and dispatch your order from Karachi."}
            </li>
            <li>You receive the tracking number by email when the order ships.</li>
            <li>The warranty shown at purchase is recorded against this order and will not change.</li>
          </ol>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/track"
              className="inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] bg-[var(--text)] px-6 font-medium text-[var(--surface)] transition-opacity  hover:opacity-90 active:scale-[0.98]"
            >
              Track this order
            </Link>
            {publicEnv.NEXT_PUBLIC_SUPPORT_PHONE && (
              <a
                href={`tel:${publicEnv.NEXT_PUBLIC_SUPPORT_PHONE}`}
                className="inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] border border-[var(--line-strong)] px-6 transition-colors  hover:bg-[var(--surface-sunken)]"
              >
                Call support
              </a>
            )}
          </div>
        </section>

        {/* Offered only once the order has actually been delivered: a returns form on an
            order still in transit is noise at best and alarming at worst. */}
        {returnsMayApply(order) && (
          <ReturnRequestForm
            orderReference={String(order.display_id)}
            items={order.items.map((item) => ({
              id: item.id,
              title: item.title,
              quantity: item.quantity,
            }))}
            windowDays={RETURN_WINDOW_DAYS}
          />
        )}

        {/* ADR-008: offered as a convenience, never as an obligation. */}
        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          You ordered as a guest. You can keep tracking this order with its reference and your
          phone number. No account needed.
        </p>
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
