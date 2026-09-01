import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { formatPkr } from "@/lib/pk";
import { getCart } from "@/lib/cart";
import {
  getCodVerificationStatus,
  listPaymentProviders,
  listShippingOptions,
  quoteDeliveryForCart,
} from "@/lib/checkout";
import { degradeGracefully } from "@/lib/log";
import { CheckoutForm } from "@/components/checkout-form";

export const metadata: Metadata = {
  title: "Checkout",
  // Checkout must never be indexed, and TRD section 11 forbids third-party marketing
  // scripts here.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PROVIDER_COPY: Record<string, { label: string; description: string }> = {
  pp_cod_cod: {
    label: "Cash on delivery",
    description: "Pay the courier in cash when your order arrives.",
  },
  pp_sandbox_sandbox: {
    label: "Card or bank payment",
    description: "You will be redirected to a secure payment page.",
  },
};

/**
 * Checkout. Source of truth: 05_UX_DESIGN_SPEC.md section 8.
 *
 * Desktop uses a sticky order summary; mobile is a single column. The summary shows the
 * figures commerce computed — the page never adds anything up itself.
 */
export default async function CheckoutPage() {
  const cart = await getCart();

  // An empty cart at checkout is a dead end, not an error page.
  if (!cart || cart.items.length === 0) redirect("/cart");

  const [allShippingOptions, paymentProviders, quote, codVerification] = await Promise.all([
    degradeGracefully("checkout.shippingOptions", [], () => listShippingOptions(cart.id)),
    degradeGracefully("checkout.paymentProviders", [], () => listPaymentProviders(cart.region_id)),
    degradeGracefully("checkout.deliveryQuote", [], () =>
      quoteDeliveryForCart(cart.id, cart.shipping_address),
    ),
    // Failing open here would only affect what the form *renders*; the gate that actually
    // refuses an unconfirmed COD order lives in commerce (PAY-005).
    degradeGracefully("checkout.codVerificationStatus", { required: false, verified: false, threshold_pkr: 0 }, () =>
      getCodVerificationStatus(cart.id),
    ),
  ]);

  const detailsComplete = Boolean(cart.email && cart.shipping_address);

  /*
   * Medusa prices every option the store offers; the zone table decides which of them the
   * destination is actually served by. Balochistan has no express service, so offering
   * "Express delivery" there would sell a next-day promise the network cannot keep — and
   * the provider would quietly price it at the standard rate.
   *
   * Before an address is entered there is nothing to filter against, so everything shows.
   */
  const servicedIds = new Set(quote.map((option) => option.id));
  const shippingOptions = quote.length
    ? allShippingOptions.filter((option) => servicedIds.has(serviceIdOf(option)))
    : allShippingOptions;

  // ETA and caveats keyed by the Medusa option, so each radio can state what it means.
  const deliveryDetail = Object.fromEntries(
    allShippingOptions.map((option) => {
      const quoted = quote.find((candidate) => candidate.id === serviceIdOf(option));
      return [
        option.id,
        quoted
          ? {
              etaMinDays: quoted.eta_min_days,
              etaMaxDays: quoted.eta_max_days,
              price: quoted.price,
              exceptions: quoted.exceptions,
            }
          : null,
      ];
    }),
  );

  /*
   * COD availability comes from the quote, which applies both the value ceiling and the
   * zone rules, rather than from a threshold retyped here. The previous hard-coded
   * 150,000 in this file was a second copy of a merchant setting, and a second copy is a
   * future disagreement.
   */
  const codQuote = quote.find((option) => servicedIds.has(option.id));
  const codAvailable = quote.length === 0 ? true : Boolean(codQuote?.cod_available);
  const codUnavailableReason =
    codQuote?.exceptions.find((note) => note.toLowerCase().includes("cash on delivery")) ??
    "Cash on delivery is not available for this order.";

  const providers = paymentProviders
    .filter((provider) => provider.is_enabled)
    .map((provider) => ({
      id: provider.id,
      label: PROVIDER_COPY[provider.id]?.label ?? provider.id,
      description: PROVIDER_COPY[provider.id]?.description ?? "",
    }));

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8">
      <h1 className="text-3xl font-semibold leading-[var(--leading-snug)] tracking-[-0.035em]">
        Checkout
      </h1>
      <p className="mt-2 text-[var(--text-muted)]">
        No account required. Your details are used to deliver this order.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <CheckoutForm
          shippingOptions={shippingOptions}
          paymentProviders={providers}
          savedEmail={cart.email}
          detailsComplete={detailsComplete}
          total={cart.total}
          codAvailable={codAvailable}
          codUnavailableReason={codUnavailableReason}
          deliveryDetail={deliveryDetail}
          codVerification={codVerification}
        />

        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="rounded-[var(--radius-card)] bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line)]">
            <h2 className="text-lg font-semibold">Order summary</h2>

            <ul className="mt-4 flex flex-col gap-3 border-b border-[var(--line)] pb-4">
              {cart.items.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-chip)] bg-[var(--surface-sunken)]">
                    {item.thumbnail && (
                      <Image
                        src={item.thumbnail}
                        alt=""
                        aria-hidden="true"
                        width={56}
                        height={56}
                        className="h-full w-full object-contain p-1"
                      />
                    )}
                  </div>
                  <div className="flex-1 text-sm">
                    <p className="font-medium">{item.variant?.product?.title ?? item.title}</p>
                    <p className="text-[var(--text-muted)]">
                      {item.variant?.title} · Qty {item.quantity}
                    </p>
                  </div>
                  <p className="font-mono text-sm">{formatPkr(item.total)}</p>
                </li>
              ))}
            </ul>

            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <Row label="Subtotal" value={formatPkr(cart.subtotal)} />
              {cart.discount_total > 0 && <Row label="Discount" value={`− ${formatPkr(cart.discount_total)}`} />}
              <Row
                label="Delivery"
                value={
                  cart.shipping_methods.length > 0
                    ? cart.shipping_total === 0
                      ? "Free"
                      : formatPkr(cart.shipping_total)
                    : "Choose a method"
                }
              />
              {cart.tax_total > 0 && <Row label="Tax" value={formatPkr(cart.tax_total)} />}
            </dl>

            <div className="mt-4 flex items-baseline justify-between border-t border-[var(--line)] pt-4">
              <span className="font-semibold">Total</span>
              <span className="font-mono text-[length:var(--text-price-xl)] font-semibold">
                {formatPkr(cart.total)}
              </span>
            </div>

            <Link
              href="/cart"
              className="mt-4 inline-block text-sm underline underline-offset-4"
            >
              Edit cart
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * The zone service a Medusa shipping option represents.
 *
 * Recorded in the option's `data` by the fulfilment provider; the name is the fallback for
 * an option created by hand in the admin without one.
 */
function serviceIdOf(option: { id: string; name: string; data?: Record<string, unknown> | null }): string {
  const serviceId = option.data?.service_id;
  if (typeof serviceId === "string") return serviceId;
  return option.name.toLowerCase().includes("express") ? "express" : "standard";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
