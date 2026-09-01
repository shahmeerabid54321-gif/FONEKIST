"use client";

import { useActionState, useState } from "react";
import { Button, InlineAlert } from "@/components/ui";
// From `return-options`, not `orders`: `orders` reaches `serverEnv` through `medusa`,
// and a client component importing it drags the server environment into the browser bundle.
import { RETURN_REASONS, RETURN_RESOLUTIONS } from "@/lib/return-options";
import { requestReturnAction, type ReturnState } from "@/app/actions/returns";

/**
 * Return request form. Source of truth: 08_DATA_MODEL.md section 13, API contract section 4.
 *
 * Collapsed behind a disclosure rather than always open: most people opening an order page
 * are checking where it is, and a returns form presented first suggests we expect the
 * purchase to have gone wrong.
 *
 * The window is stated up front, and the form does not pretend to approve anything —
 * eligibility is decided in commerce and a refusal comes back with its reason.
 */
export function ReturnRequestForm({
  orderReference,
  items,
  windowDays,
}: {
  orderReference: string;
  items: { id: string; title: string; quantity: number }[];
  windowDays: number;
}) {
  const [state, submit, submitting] = useActionState<ReturnState | null, FormData>(
    requestReturnAction,
    null,
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  if (state?.ok) {
    return (
      <section className="mt-10">
        <InlineAlert tone="success" title="Return requested">
          {state.message}
        </InlineAlert>
      </section>
    );
  }

  return (
    <details className="mt-10 rounded-[var(--radius-card)] bg-[var(--surface-raised)] p-6 ring-1 ring-[var(--line)]">
      <summary className="cursor-pointer font-semibold">Return an item</summary>

      <p className="mt-3 text-sm text-[var(--text-muted)]">
        You can request a return within {windowDays} days of delivery. We will review the request
        and tell you what happens next. Nothing is sent back until we confirm.
      </p>

      <form action={submit} className="mt-5 flex flex-col gap-5">
        <input type="hidden" name="order_reference" value={orderReference} />

        <fieldset>
          <legend className="text-sm font-medium">
            Which items?
          </legend>
          <ul className="mt-2 flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3">
                <label className="flex flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    name="line_id"
                    value={item.id}
                    checked={selected[item.id] ?? false}
                    onChange={(event) =>
                      setSelected((current) => ({ ...current, [item.id]: event.target.checked }))
                    }
                    className="h-4 w-4"
                  />
                  <span>{item.title}</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">Qty</span>
                  <input
                    type="number"
                    name={`quantity_${item.id}`}
                    min={1}
                    max={item.quantity}
                    defaultValue={1}
                    disabled={!selected[item.id]}
                    className="font-mono min-h-[36px] w-20 rounded-[var(--radius-chip)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2 disabled:opacity-50"
                  />
                  <span className="text-[var(--text-muted)]">of {item.quantity}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="return-reason" className="block text-sm font-medium">
              Reason
            </label>
            <select
              id="return-reason"
              name="reason_code"
              required
              className="mt-1.5 min-h-[44px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3"
            >
              {RETURN_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="return-resolution"
              className="block text-sm font-medium"
            >
              What would you like?
            </label>
            <select
              id="return-resolution"
              name="requested_resolution"
              className="mt-1.5 min-h-[44px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3"
            >
              {RETURN_RESOLUTIONS.map((resolution) => (
                <option key={resolution.value} value={resolution.value}>
                  {resolution.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="return-phone" className="block text-sm font-medium">
            Mobile number used on the order
          </label>
          <input
            id="return-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="03XX XXXXXXX"
            className="mt-1.5 min-h-[44px] w-full max-w-xs rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3"
          />
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            We ask for this to confirm the request comes from you.
          </p>
        </div>

        <div>
          <label htmlFor="return-notes" className="block text-sm font-medium">
            Anything else we should know? (optional)
          </label>
          <textarea
            id="return-notes"
            name="notes"
            rows={3}
            maxLength={1000}
            className="mt-1.5 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-3"
          />
        </div>

        {state && !state.ok && <InlineAlert tone="danger">{state.message}</InlineAlert>}

        <Button type="submit" tone="secondary" loading={submitting} loadingLabel="Sending request">
          Request return
        </Button>
      </form>
    </details>
  );
}
