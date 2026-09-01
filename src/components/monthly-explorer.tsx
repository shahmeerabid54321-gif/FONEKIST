"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { formatPkr } from "@/lib/pk";
import { ProductCard, type ProductCardData } from "./product-card";
import { Meter } from "./brand/signal-arc";

/**
 * "What can I get for Rs 8,000 a month?"
 *
 * The band this replaces was a static row of the three cheapest plans, which answers a
 * question nobody asked. In this market the budget is the starting point and the handset is
 * the answer, so the control is the budget and the grid is the response. Pressing a figure
 * re-renders instantly because the whole pool is already on the page: no round trip, no
 * spinner, no lost place on the page.
 *
 * Two honesty rules hold here as everywhere else:
 *
 *  - **A tier is only offered when something is actually in it.** Tiers are derived from
 *    the phones present, so the control can never advertise a budget that returns nothing
 *    and cannot imply a cheaper entry point than we sell.
 *  - **A monthly figure never appears without its total** (INST-003, ADR-025). The card
 *    states "from Rs X a month" and the product page it links to shows the cash price, the
 *    advance, the arithmetic and the total before anybody can apply. The figure here is a
 *    way in, never the whole offer.
 *
 * It degrades honestly without JavaScript: the pool renders under the default tier, and
 * every tier also exists as a real filtered URL under "See all".
 */

/** Candidate budgets, in rupees per month. Only those with stock behind them are shown. */
const TIERS = [5_000, 8_000, 12_000, 20_000, 35_000] as const;

export function MonthlyExplorer({ phones }: { phones: ProductCardData[] }) {
  const tiers = useMemo(() => {
    const cheapest = phones
      .map((phone) => phone.monthlyFrom)
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b)[0];

    if (cheapest == null) return [];
    // A tier below the cheapest plan we sell would render an empty grid and read as a
    // budget we cater to. Only tiers with something in them are offered.
    return TIERS.filter((tier) => tier >= cheapest);
  }, [phones]);

  const [budget, setBudget] = useState<number | null>(() => tiers[1] ?? tiers[0] ?? null);

  const matching = useMemo(
    () =>
      budget == null
        ? phones
        : phones.filter((phone) => phone.monthlyFrom != null && phone.monthlyFrom <= budget),
    [phones, budget],
  );

  if (phones.length === 0) return null;

  const shown = matching.slice(0, 6);

  /*
   * Built here rather than passed in. A URL builder is a function, and a function cannot
   * cross the server-to-client boundary: handing one down as a prop looks fine in the
   * editor and throws when the page actually renders.
   */
  const seeAll =
    budget == null
      ? "/phones?installments=1&in_stock=1"
      : `/phones?installments=1&in_stock=1&monthly_max=${budget}`;

  return (
    <div>
      <div
        role="group"
        aria-label="Monthly budget"
        className="snap-rail -mx-5 flex gap-2.5 px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {tiers.map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => setBudget(tier)}
            aria-pressed={budget === tier}
            className={
              budget === tier
                ? "inline-flex min-h-[44px] shrink-0 items-center rounded-[var(--radius-chip)] bg-[var(--text)] px-5 text-sm font-semibold text-[var(--surface)]"
                : "nav-pill inline-flex min-h-[44px] shrink-0 items-center bg-[var(--surface-tile)] px-5 text-sm font-medium text-[var(--text-soft)]"
            }
          >
            Up to {formatPkr(tier)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setBudget(null)}
          aria-pressed={budget === null}
          className={
            budget === null
              ? "inline-flex min-h-[44px] shrink-0 items-center rounded-[var(--radius-chip)] bg-[var(--text)] px-5 text-sm font-semibold text-[var(--surface)]"
              : "nav-pill inline-flex min-h-[44px] shrink-0 items-center bg-[var(--surface-tile)] px-5 text-sm font-medium text-[var(--text-soft)]"
          }
        >
          Any budget
        </button>
      </div>

      {/*
        Announced, because pressing a button that silently swaps a grid further down the
        page tells a screen reader nothing happened.
      */}
      {/*
        The count, and a bar showing what share of the plans on offer that is.

        The bar illustrates the sentence beside it and never replaces it: it is
        `aria-hidden` for that reason, because "62 per cent" with no unit attached tells a
        screen reader user less than the sentence already did. It is also a real proportion
        of a real pool, not a progress-toward-a-reward (ADR-003).
      */}
      <p className="mt-5 text-sm text-[var(--text-soft)]" aria-live="polite">
        {matching.length === 0 ? (
          <>No phone we carry has a plan at that figure yet.</>
        ) : (
          <>
            <strong className="font-semibold text-[var(--text)]">
              {matching.length} {matching.length === 1 ? "phone" : "phones"}
            </strong>{" "}
            {budget == null ? (
              <>available on a monthly plan.</>
            ) : (
              <>
                of {phones.length} from {formatPkr(budget)} a month or less.
              </>
            )}{" "}
            Every plan shows its total before you apply.
          </>
        )}
      </p>

      {phones.length > 0 && (
        <Meter
          value={matching.length / phones.length}
          tone="trust"
          className="mt-3 max-w-sm"
        />
      )}

      {shown.length > 0 && (
        <ul className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((phone) => (
            <li key={phone.handle} className="relative">
              <ProductCard product={phone} />
            </li>
          ))}
        </ul>
      )}

      {matching.length > shown.length && (
        <div className="mt-8">
          <Link
            href={seeAll as Route}
            className="inline-flex min-h-[48px] items-center rounded-[var(--radius-chip)] border border-[var(--line-strong)] px-7 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-tile)]"
          >
            See all {matching.length}
            {budget != null ? ` under ${formatPkr(budget)} a month` : " on a plan"}
          </Link>
        </div>
      )}
    </div>
  );
}
