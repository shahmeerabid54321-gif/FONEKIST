import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatPkr } from "@/lib/pk";
import { features } from "@/lib/features";
import { getApplicationStatus } from "@/lib/installments";
import { InlineAlert } from "@/components/ui";

export const metadata: Metadata = {
  title: "Check an application",
  robots: { index: false, follow: false },
};

/**
 * Application status.
 *
 * The reference plus the phone number used on the application is the second factor, exactly
 * as for order lookup: guest checkout is the default (ADR-008), so most applicants have no
 * account.
 *
 * An unknown reference and a wrong phone number produce the identical message. That is not
 * politeness: distinguishable answers would let somebody walk the reference space to
 * discover which applications exist (SEC-004).
 *
 * A plain GET form, so the check works with no JavaScript and the result is a real URL the
 * applicant can return to.
 */
export default async function ApplicationStatusPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!features.installments) notFound();

  const params = await searchParams;
  const reference = typeof params.reference === "string" ? params.reference : "";
  const phone = typeof params.phone === "string" ? params.phone : "";

  const application = reference && phone ? await getApplicationStatus(reference, phone) : null;
  const attempted = Boolean(reference && phone);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
        Check an application
      </h1>
      <p className="mt-3 text-[var(--text-soft)]">
        Enter your reference and the mobile number you applied with.
      </p>

      <form method="get" className="mt-8 space-y-5">
        <div>
          <label htmlFor="reference" className="block text-sm font-medium text-[var(--text)]">
            Application reference
          </label>
          <input
            id="reference"
            name="reference"
            defaultValue={reference}
            placeholder="FK-1A2B3C4D"
            required
            className="mt-1.5 block min-h-[44px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 font-mono text-[var(--text)]"
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-[var(--text)]">
            Mobile number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={phone}
            placeholder="0300 1234567"
            required
            className="mt-1.5 block min-h-[44px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 text-[var(--text)]"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-control)] bg-[var(--text)] px-6 text-sm font-medium text-[var(--surface)]"
        >
          Check
        </button>
      </form>

      {attempted && !application && (
        <div className="mt-8">
          <InlineAlert tone="warning">
            We could not find an application with those details. Check the reference and the
            number you applied with.
          </InlineAlert>
        </div>
      )}

      {application && (
        <section
          className="mt-10 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-raised)] p-6"
          aria-labelledby="status-heading"
        >
          <p className="font-mono text-xs uppercase tracking-widest text-[var(--text-muted)]">
            {application.reference}
          </p>
          <h2 id="status-heading" className="mt-2 text-xl font-semibold text-[var(--text)]">
            {application.state_label}
          </h2>

          <p className="mt-3 text-[var(--text-soft)]">
            {STATUS_COPY[application.state] ?? "We will be in touch."}
          </p>

          <dl className="mt-6 space-y-2 border-t border-[var(--line)] pt-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-soft)]">Advance</dt>
              <dd className="font-mono text-[var(--text)]">
                {formatPkr(application.plan.advance_pkr)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-soft)]">Monthly</dt>
              <dd className="font-mono text-[var(--text)]">
                {formatPkr(application.plan.monthly_pkr)} x {application.plan.tenure_months}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-soft)]">Total</dt>
              <dd className="font-mono font-semibold text-[var(--text)]">
                {formatPkr(application.plan.total_payable_pkr)}
              </dd>
            </div>
          </dl>

          {application.reserved_until && (
            <p className="mt-5 text-sm text-[var(--text-muted)]">
              Handset held until {new Date(application.reserved_until).toLocaleString("en-PK")}.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * What each state actually means for the applicant.
 *
 * Written plainly and never optimistically: "under review" does not become "almost there",
 * and a decline is not softened into something that reads like a delay. Somebody who reads
 * a rejection as a wait will keep waiting.
 */
const STATUS_COPY: Record<string, string> = {
  submitted: "We have your application and the handset is set aside for you.",
  under_review: "Somebody is reading it now. The handset is still set aside.",
  more_information_required:
    "We need something else before we can decide. Check your email, or call us.",
  approved:
    "Approved. We will call you to arrange the advance and the paperwork. We never ask for card or bank details by phone.",
  rejected:
    "We were not able to approve this one. The handset has been released. You can still buy it outright or with cash on delivery.",
  expired:
    "We did not manage to finish reviewing this in time, so the handset was released. Nothing was charged and you are welcome to apply again.",
  cancelled: "This application was cancelled. Nothing was charged.",
  handed_off: "Approved and being arranged. We will be in touch about delivery.",
};
