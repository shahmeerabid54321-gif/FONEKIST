import type { Metadata } from "next";
import Link from "next/link";
import { formatPkr } from "@/lib/pk";
import { degradeGracefully } from "@/lib/log";
import { search } from "@/lib/search";
import { hitToCard, ProductGrid } from "@/components/product-grid";
import { dynamicRoute } from "@/lib/routes";

export const metadata: Metadata = {
  title: "How installments work",
  description:
    "Buy a phone in installments with the cash price, the advance, the monthly amount and the total you will pay all shown before you apply.",
};

/**
 * How installments work.
 *
 * The page exists to say the two things the reference sites do not: that the installment
 * price is higher than the cash price, and by exactly how much. Everything else is
 * mechanics, and mechanics were most of what was here.
 *
 * It had five stacked sections: a hero, four numbered steps carrying a hundred and eighty
 * words of prose, a documents checklist, the phones, and a second call to action for people
 * who had already applied. Two of those were in the wrong place rather than too long. The
 * checklist told somebody what to gather on a page they read before choosing a handset,
 * which is a page too early, so it now opens the application form where it is actually
 * actionable. "Already applied" was a whole section for one link, so it is one link.
 *
 * Three blocks are left: what this is, how it goes, and the phones it applies to. Prose
 * keeps a readable measure and only the grid takes the full width, so the page has two
 * widths with a reason rather than four by accident.
 */
export default async function InstallmentsPage() {
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
          One primary action, because there is one. An application is always for a specific
          handset on a specific plan, so there is nothing to start before that is chosen and
          the button goes to the phones. The status link is secondary and inline: it is for
          people who are finished here, and it used to be a section of its own.
        */}
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href={dynamicRoute("/phones?installments=1")}
            className="inline-flex min-h-[52px] items-center rounded-[var(--radius-chip)] bg-[var(--text)] px-6 text-[length:var(--text-body-lg)] font-medium text-[var(--surface)] transition-opacity duration-200 [transition-timing-function:var(--ease-brand)] hover:opacity-90 active:scale-[0.98]"
          >
            Choose a phone
          </Link>
          <Link href="/installments/status" className="text-sm text-[var(--text-soft)] underline">
            Already applied?
          </Link>
        </div>
      </header>

      <section className="mt-14 max-w-3xl" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-xl font-semibold text-[var(--text)]">
          How it works
        </h2>
        <ol className="mt-6 space-y-4">
          {[
            "Pick a handset and a plan. Every plan shows the cash price, the advance, the monthly amount, the total you will pay and the difference from cash.",
            "Apply from that handset's page. We need your CNIC, a guarantor's CNIC, your contact details and what you earn.",
            "We hold the handset while a person reviews it, and we tell you either way.",
          ].map((step, index) => (
            <li key={step} className="flex gap-5">
              <span className="font-mono text-sm text-[var(--text-muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="leading-relaxed text-[var(--text-soft)]">{step}</p>
            </li>
          ))}
        </ol>
        {/*
          Said once. It was on this page three times, and again on the apply page, in the
          plan panel and in the disclosure block. A sentence repeated that often stops being
          read, which is the opposite of what it is for.
        */}
        <p className="mt-6 text-sm text-[var(--text-muted)]">
          Nothing is charged when you apply, and no payment is taken through this website at
          any stage.{" "}
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
    </div>
  );
}
