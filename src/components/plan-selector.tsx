"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPkr } from "@/lib/pk";
import type { PlanView } from "@/lib/installments";
import { InstallmentDisclosure } from "./installment-disclosure";
import { Price } from "./price";
import { dynamicRoute } from "@/lib/routes";
import { IconCalendar } from "./icons";

/**
 * Cash or installments, on the PDP.
 *
 * The toggle defaults to **cash**. Defaulting to installments would present the monthly
 * figure as the price of the handset, which is the trick this storefront was built to
 * avoid: it makes an expensive phone look cheap by hiding what it costs.
 *
 * Selecting a plan always renders the full disclosure block underneath it. There is no
 * state in which a monthly figure is on screen without the total beside it (INST-004).
 */
export function PlanSelector({
  variantId,
  cashPrice,
  compareAt,
  plans,
}: {
  variantId: string;
  cashPrice: number;
  compareAt: number | null;
  plans: PlanView[];
}) {
  const [mode, setMode] = useState<"cash" | "installments">("cash");
  const [selectedId, setSelectedId] = useState<string | null>(plans[0]?.id ?? null);

  if (plans.length === 0) {
    return <Price amount={cashPrice} compareAt={compareAt} size="large" />;
  }

  const selected = plans.find((plan) => plan.id === selectedId) ?? plans[0]!;
  const cheapest = [...plans].sort((a, b) => a.monthly_pkr - b.monthly_pkr)[0]!;

  return (
    <div>
      <div
        role="tablist"
        aria-label="How to pay"
        className="inline-flex rounded-[var(--radius-control)] border border-[var(--line-strong)] p-1"
      >
        {(["cash", "installments"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={[
              "min-h-[40px] rounded-[calc(var(--radius-control)-2px)] px-4 text-sm font-medium transition-colors",
              mode === value
                ? "bg-[var(--text)] text-[var(--surface)]"
                : "text-[var(--text-soft)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            {value === "cash" ? "Pay in full" : "Installments"}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {mode === "cash" ? (
          <>
            <Price amount={cashPrice} compareAt={compareAt} size="large" />
            <p className="mt-2 text-sm text-[var(--text-soft)]">
              Or from {formatPkr(cheapest.monthly_pkr)} a month on an installment plan.
            </p>
          </>
        ) : (
          <>
            <fieldset>
              <legend className="text-sm font-medium text-[var(--text)]">Choose a plan</legend>
              <ul className="mt-3 flex flex-wrap gap-2">
                {plans.map((plan) => {
                  const active = plan.id === selected.id;
                  return (
                    <li key={plan.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(plan.id)}
                        aria-pressed={active}
                        className={[
                          "flex min-h-[52px] flex-col justify-center rounded-[var(--radius-control)] border px-4 py-2 text-left transition-colors",
                          // Chosen, not trusted: a selected tenure is a selection state and
                          // takes ink, the same as every other chosen thing on the site.
                          active
                            ? "border-[var(--text)] bg-[var(--surface-sunken)] ring-1 ring-[var(--text)]"
                            : "border-[var(--line-strong)] hover:bg-[var(--surface-sunken)]",
                        ].join(" ")}
                      >
                        <span className="text-sm font-medium text-[var(--text)]">
                          {plan.label}
                        </span>
                        <span className="font-mono text-sm text-[var(--text-muted)]">
                          {formatPkr(plan.monthly_pkr)}/mo
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <div className="mt-5">
              <InstallmentDisclosure plan={selected} />
            </div>

            <Link
              href={dynamicRoute(
                `/installments/apply?variant=${encodeURIComponent(variantId)}&plan=${encodeURIComponent(selected.id)}`,
              )}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--text)] px-5 text-sm font-semibold text-[var(--surface)] transition-opacity duration-200 [transition-timing-function:var(--ease-brand)] hover:opacity-90"
            >
              <IconCalendar />
              Apply for this plan
            </Link>

            <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
              Applying does not charge you anything. We hold the handset while a person
              reviews your application, and we tell you the outcome either way.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
