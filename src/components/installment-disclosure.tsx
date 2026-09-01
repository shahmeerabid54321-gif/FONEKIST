import { formatPkr } from "@/lib/pk";
import type { PlanView } from "@/lib/installments";
import { IconCalendar } from "./icons";

/**
 * The disclosure block (INST-004).
 *
 * This is the single component that makes FONEKIST better than the sites it was modelled
 * on rather than a copy of them. Every one of those sites shows a monthly figure and an
 * advance; none of them shows what the handset ends up costing, so a customer cannot tell
 * whether the plan is worth taking until they have taken it.
 *
 * So every figure is on screen at once: the cash price, the advance, the monthly amount
 * times the number of months, the total, and the difference from cash in rupees and per
 * cent. The arithmetic is written out (`Rs 32,500 x 12`) rather than summarised, because a
 * total the reader can check is a total the reader can trust.
 *
 * Nothing here is computed in the browser. Commerce returns the figures already computed
 * from the shared contract, so a page cannot display arithmetic the backend would not
 * stand behind (ADR-014).
 */
export function InstallmentDisclosure({ plan }: { plan: PlanView }) {
  const rows: { label: string; value: string; emphasis?: boolean }[] = [
    { label: "Cash price", value: formatPkr(plan.cash_price_pkr) },
    { label: "Advance", value: formatPkr(plan.advance_pkr) },
    {
      label: "Monthly",
      value: `${formatPkr(plan.monthly_pkr)} x ${plan.tenure_months} = ${formatPkr(plan.monthly_total_pkr)}`,
    },
    { label: "Total you pay", value: formatPkr(plan.total_payable_pkr), emphasis: true },
  ];

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-sunken)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text)]">{plan.label}</h3>

      <dl className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-[var(--text-soft)]">{row.label}</dt>
            <dd
              className={
                row.emphasis
                  ? "font-mono text-sm font-semibold text-[var(--text)]"
                  : "font-mono text-sm text-[var(--text)]"
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {/*
        The line the reference sites omit. Kept visually distinct and never softened: this
        is what the plan costs, and a customer who is surprised by it later was not told.
      */}
      {/*
        The same sentence, drawn.

        Two stacked bars to scale: the cash price, and the total this plan comes to. The gap
        between them IS the difference the sentence states, which is the one number every
        reference storefront leaves out. The figures stay in words above and below it, and
        the bars are `aria-hidden`, because a bar is an illustration of a disclosure and
        never the disclosure itself (ADR-025).

        Nothing here is computed in the browser beyond the ratio between two figures
        commerce already returned.
      */}
      <div aria-hidden="true" className="mt-5 border-t border-[var(--line)] pt-4">
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 font-mono text-[11px] text-[var(--text-muted)]">Cash</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-[var(--radius-chip)] bg-[var(--line)]">
            <span
              className="block h-full rounded-[var(--radius-chip)] bg-[var(--text)]"
              style={{ width: `${(plan.cash_price_pkr / plan.total_payable_pkr) * 100}%` }}
            />
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span className="w-14 shrink-0 font-mono text-[11px] text-[var(--text-muted)]">Plan</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-[var(--radius-chip)] bg-[var(--line)]">
            <span className="block h-full w-full rounded-[var(--radius-chip)] bg-[var(--color-amber)]" />
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm text-[var(--text-soft)]">
        That is{" "}
        <strong className="font-semibold text-[var(--text)]">
          {formatPkr(plan.difference_pkr)} more than paying cash
        </strong>{" "}
        ({plan.difference_percent}% more).
      </p>

      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
        This is a purchase in installments, not a loan. Nothing is charged when you apply.
      </p>
    </div>
  );
}

/**
 * The one-line form for a card or a comparison cell.
 *
 * A card cannot carry the full block, so it carries the monthly figure and says where the
 * rest is. It never shows a monthly amount alone with no route to the total.
 */
export function InstallmentSummary({ plan }: { plan: PlanView }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--color-emerald-strong)]">
      <IconCalendar className="h-4 w-4" />
      From {formatPkr(plan.monthly_pkr)} a month
      <span className="text-[var(--text-muted)]"> · total shown before you apply</span>
    </p>
  );
}
