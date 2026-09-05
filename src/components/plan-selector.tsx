"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPkr } from "@/lib/pk";
import type { PlanView } from "@/lib/installments";
import { InstallmentDisclosure } from "./installment-disclosure";
import { AddToQueryForm } from "./add-to-query-form";
import { features } from "@/lib/features";
import { enquiryChatUrl } from "@/lib/whatsapp";
import { dynamicRoute } from "@/lib/routes";
import { IconCalendar } from "./icons";

/**
 * Choosing a plan, on the PDP.
 *
 * This panel used to open with a "Pay in full / Installments" tablist, because the site
 * carried a cash rail alongside the plans. It does not any more: FONEKIST sells on
 * installments only, so a toggle with one working half was a control that asked a question
 * with one answer, and the cash "Add to cart" button underneath it stayed on screen even
 * while the installments tab was selected.
 *
 * What is left is the decision that is actually being made: which tenure. The plans are on
 * screen immediately and the full disclosure sits under them, so INST-004 now holds by
 * construction rather than by remembering to keep the two halves in step. There is no state
 * in which a monthly figure appears without its total, because there is no other state.
 *
 * **The cash price is still here, and it is still the point.** It is the first row of the
 * disclosure and the bar the plan is measured against ("Rs 12,801 more than paying cash").
 * It is a comparison figure, not an offer: nothing on this site can be bought outright, and
 * showing the monthly amount without the cash price beside it is the trick this storefront
 * exists to avoid (ADR-025).
 */
export function PlanSelector({
  handle,
  title,
  variantId,
  plans,
  disabled = false,
  disabledReason,
}: {
  handle: string;
  title: string;
  variantId: string;
  plans: PlanView[];
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(plans[0]?.id ?? null);

  if (plans.length === 0) return null;

  const selected = plans.find((plan) => plan.id === selectedId) ?? plans[0]!;

  /*
   * Where "apply" goes depends on whether intake is open.
   *
   * `NEXT_PUBLIC_FEATURE_INSTALLMENTS` gates the CNIC form, not the shop (ADR-025). With it
   * off the plans and the disclosure are still the whole page and the query still works;
   * only the place to hand over identity documents is withheld. So the button becomes a
   * WhatsApp message carrying this exact plan, and a customer who has chosen one is never
   * left holding a decision with nothing to press.
   */
  const enquiryHref = features.installments ? null : enquiryChatUrl(title, selected);

  const ctaClass =
    "mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--text)] px-5 text-sm font-semibold text-[var(--surface)] transition-opacity duration-200 [transition-timing-function:var(--ease-brand)] hover:opacity-90";

  const primary = features.installments ? (
    <Link
      href={dynamicRoute(
        `/installments/apply?variant=${encodeURIComponent(variantId)}&plan=${encodeURIComponent(selected.id)}`,
      )}
      className={ctaClass}
    >
      <IconCalendar />
      Apply for this plan
    </Link>
  ) : enquiryHref ? (
    <a href={enquiryHref} target="_blank" rel="noopener noreferrer" className={ctaClass}>
      <IconCalendar />
      Ask about this plan on WhatsApp
    </a>
  ) : (
    <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-sunken)] px-4 py-3 text-sm text-[var(--text-soft)]">
      Applications are not open yet. Add this plan to your query and it will be here when
      they are.
    </p>
  );

  return (
    <div>
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
                    // Chosen, not trusted: a selected tenure is a selection state and takes
                    // ink, the same as every other chosen thing on the site.
                    active
                      ? "border-[var(--text)] bg-[var(--surface-sunken)] ring-1 ring-[var(--text)]"
                      : "border-[var(--line-strong)] hover:bg-[var(--surface-sunken)]",
                  ].join(" ")}
                >
                  <span className="text-sm font-medium text-[var(--text)]">{plan.label}</span>
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

      {/*
        Apply first, shortlist second.

        The query is a convenience for somebody weighing up three handsets, never the way in
        to an application. Keeping the direct route primary means a browser that refuses
        cookies loses the shortlist and nothing else.
      */}
      {disabled ? (
        <p className="mt-4 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-sunken)] px-4 py-3 text-sm text-[var(--text-soft)]">
          {disabledReason ?? "This handset is unavailable."} We can only hold a handset that is
          in stock, so there is nothing to apply for right now.
        </p>
      ) : (
        <>
          {primary}

          <div className="mt-3">
            <AddToQueryForm handle={handle} variantId={variantId} planId={selected.id} />
          </div>
        </>
      )}

      {!disabled && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
          {features.installments
            ? "Applying does not charge you anything. We hold the handset while a person reviews your application, and we tell you the outcome either way."
            : "Nothing is charged. A person reads the message and replies to you."}
        </p>
      )}
    </div>
  );
}
