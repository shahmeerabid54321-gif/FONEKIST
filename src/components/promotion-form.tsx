"use client";

import { useActionState } from "react";
import { InlineAlert } from "@/components/ui";
import {
  applyPromotionAction,
  removePromotionAction,
  type ActionResult,
} from "@/app/actions/cart";

/**
 * Promotion code entry. Source of truth: 05_UX_DESIGN_SPEC.md section 7.
 *
 * Presented as a plain, optional field rather than a banner offering a discount nobody
 * has. Advertising a code slot to customers who do not have one manufactures the feeling
 * of missing out, which PRD section 8 rules out — the field is there for people who were
 * given a code.
 */
export function PromotionForm({ applied }: { applied: { code: string }[] }) {
  const [applyState, apply, applying] = useActionState<ActionResult | null, FormData>(
    applyPromotionAction,
    null,
  );
  const [, remove, removing] = useActionState<ActionResult | null, FormData>(
    removePromotionAction,
    null,
  );

  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      {applied.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {applied.map((promotion) => (
            <li key={promotion.code} className="flex items-center justify-between gap-3">
              <span className="text-sm">
                Code <span className="font-medium">{promotion.code}</span> applied
              </span>
              <form action={remove}>
                <input type="hidden" name="promo_code" value={promotion.code} />
                <button
                  type="submit"
                  disabled={removing}
                  className="min-h-[32px] text-sm underline underline-offset-4 disabled:opacity-60"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={apply} className="flex items-end gap-2">
        <div className="flex-1">
          <label
            htmlFor="promo-code"
            className="block text-sm text-[var(--text-muted)]"
          >
            Promotion code
          </label>
          <input
            id="promo-code"
            name="promo_code"
            type="text"
            autoComplete="off"
            // Codes are conventionally upper case; normalising the display avoids a
            // customer thinking a valid code was rejected because of how they typed it.
            className="mt-1 min-h-[44px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3 uppercase"
          />
        </div>
        <button
          type="submit"
          disabled={applying}
          className="min-h-[44px] rounded-[var(--radius-chip)] border border-[var(--line-strong)] px-5 transition-colors  hover:bg-[var(--surface-sunken)] hover:bg-[var(--surface-sunken)] disabled:opacity-60"
        >
          {applying ? "Applying" : "Apply"}
        </button>
      </form>

      {applyState && (
        <div className="mt-3">
          <InlineAlert tone={applyState.ok ? "success" : "danger"}>{applyState.message}</InlineAlert>
        </div>
      )}
    </div>
  );
}
