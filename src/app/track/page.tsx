import type { Metadata } from "next";
import { InlineAlert } from "@/components/ui";
import { OrderLookupForm } from "@/components/order-lookup-form";

export const metadata: Metadata = {
  title: "Track your order",
  description: "Look up an order with its reference and the phone number used at checkout.",
  robots: { index: true, follow: true },
};

/**
 * Order tracking entry point. Source of truth: CUST-018 and ADR-008.
 *
 * Guest customers must be able to track without an account, so lookup takes the public
 * order reference plus a second factor — the phone number used at checkout. The API never
 * exposes sequential ids and is rate limited (API contract section 4, SEC-004).
 */
export default function TrackPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-semibold leading-[var(--leading-snug)] tracking-[-0.035em]">
          Track your order
        </h1>
        <p className="mt-3 text-[var(--text-muted)]">
          Enter the order reference from your confirmation email and the mobile number you
          ordered with. No account needed.
        </p>

        <div className="mt-8">
          <OrderLookupForm />
        </div>

        <div className="mt-8">
          <InlineAlert tone="info" title="Cannot find your reference?">
            It is on your confirmation email, shown as a number such as 1042. If you cannot
            find it, contact support with the mobile number you ordered with.
          </InlineAlert>
        </div>
      </div>
    </div>
  );
}
