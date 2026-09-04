import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPkr } from "@/lib/pk";
import { features } from "@/lib/features";
import { degradeGracefully } from "@/lib/log";
import { search } from "@/lib/search";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { dynamicRoute } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Installments",
  description:
    "Buy a phone in installments with the cash price, the advance, the monthly amount and the total you will pay all shown before you apply.",
};

/**
 * How installments work.
 *
 * The page exists to say the two things the reference sites do not: that the installment
 * price is higher than the cash price, and by exactly how much. Everything else is
 * mechanics.
 *
 * It says plainly that nothing is charged on the website, because that is both true and the
 * question everybody actually has, and because a page that is vague about when money moves
 * is indistinguishable from one that intends to surprise you.
 */
export default async function InstallmentsPage() {
  if (!features.installments) notFound();

  const cheapest = await degradeGracefully("installments.cheapest", null, () =>
    search({ q: "", sort: "price_asc", perPage: 6, installmentsOnly: true, inStockOnly: true }),
  );

  const from = cheapest?.hits
    .map((hit) => hit.min_monthly_pkr)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b)[0];

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
          Installments, with the total on the same screen
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--text-soft)]">
          Buying in installments costs more than paying cash. We show you exactly how much
          more, in rupees, before you apply, on the same screen as the monthly figure.
        </p>
        {from != null && (
          <p className="mt-4 text-[var(--text)]">
            Plans start at <strong className="font-semibold">{formatPkr(from)} a month</strong>.
          </p>
        )}

        {/*
          The page that explains installments now has a way to start one.

          It had four steps, a list of documents and a single outline button, and that button
          was "Check an application" - a control for people who had already applied. Somebody
          reading this page to decide whether to apply had nowhere to press. The primary
          action goes to the handsets available on a plan, because an application is always
          for one specific handset and one specific plan: there is no application to start
          before that is chosen.
        */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={dynamicRoute("/phones?installments=1")}
            className="inline-flex min-h-[52px] items-center rounded-[var(--radius-chip)] bg-[var(--text)] px-6 text-[length:var(--text-body-lg)] font-medium text-[var(--surface)] transition-opacity duration-200 [transition-timing-function:var(--ease-brand)] hover:opacity-90 active:scale-[0.98]"
          >
            Choose a phone and apply
          </Link>
          <p className="text-sm text-[var(--text-muted)]">Nothing is charged when you apply.</p>
        </div>
      </header>

      <section className="mt-14 max-w-3xl" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-xl font-semibold text-[var(--text)]">
          How it works
        </h2>
        <ol className="mt-6 space-y-6">
          {[
            {
              title: "Choose a handset and a plan",
              body: "Every plan shows the cash price, the advance, the monthly amount, the number of months, the total you will pay, and the difference from cash in rupees and per cent.",
            },
            {
              title: "Apply from the handset's page",
              body: "Pick the plan you want on the phone you want, then press Apply for this plan. We need your CNIC, a guarantor's CNIC, your contact details and what you earn. Nothing is charged when you apply, and no payment is taken through this website at any stage.",
            },
            {
              title: "We hold the handset",
              body: "The handset is set aside for you while a person reviews the application. If we cannot review it in time it is released and nothing is charged.",
            },
            {
              title: "We tell you either way",
              body: "If we approve it, we call you to arrange the advance and sign the agreement. If we do not, the handset is released and you can still buy it outright or with cash on delivery.",
            },
          ].map((step, index) => (
            <li key={step.title} className="flex gap-5">
              <span className="font-mono text-sm text-[var(--text-muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-medium text-[var(--text)]">{step.title}</h3>
                <p className="mt-1.5 leading-relaxed text-[var(--text-soft)]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14 max-w-3xl" aria-labelledby="need-heading">
        <h2 id="need-heading" className="text-xl font-semibold text-[var(--text)]">
          What you need
        </h2>
        <ul className="mt-5 space-y-2 text-[var(--text-soft)]">
          <li>Your CNIC, both sides.</li>
          <li>A guarantor, and their CNIC, both sides. It must be someone other than you.</li>
          <li>To be 18 or older.</li>
          <li>A phone number and email we can reach you on.</li>
        </ul>
        <p className="mt-5 text-sm leading-relaxed text-[var(--text-muted)]">
          Your documents are used to decide this application and, if it is approved, to
          service it. Only the staff reviewing applications can see them, every access is
          recorded, and they are deleted 90 days after a decline or after a settled
          agreement.{" "}
          <Link href="/policies/installments" className="underline">
            Read the full terms
          </Link>
        </p>
      </section>

      {cheapest && cheapest.hits.length > 0 && (
        <section className="mt-16" aria-labelledby="available-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="available-heading" className="text-xl font-semibold text-[var(--text)]">
              Available on a plan
            </h2>
            <Link
              href={dynamicRoute("/phones?installments=1")}
              className="text-sm text-[var(--text-soft)] underline"
            >
              See all
            </Link>
          </div>
          <div className="mt-6">
            <ProductGrid products={cheapest.hits.map(hitToCard)} />
          </div>
        </section>
      )}

      <section className="mt-16 max-w-3xl" aria-labelledby="status-heading">
        <h2 id="status-heading" className="text-xl font-semibold text-[var(--text)]">
          Already applied
        </h2>
        <p className="mt-2 text-[var(--text-soft)]">
          Check where your application has got to with your reference and the phone number
          you applied with.
        </p>
        <Link
          href="/installments/status"
          className="mt-5 inline-flex min-h-[44px] items-center rounded-[var(--radius-control)] border border-[var(--line-strong)] px-5 text-sm font-medium text-[var(--text)]"
        >
          Check an application
        </Link>
      </section>
    </div>
  );
}
