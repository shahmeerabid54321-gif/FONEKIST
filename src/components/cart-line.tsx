"use client";

import Image from "next/image";
import { useActionState } from "react";
import Link from "next/link";
import { formatPkr } from "@/lib/pk";
import { InlineAlert } from "@/components/ui";
import { removeLineAction, updateQuantityAction, type ActionResult } from "@/app/actions/cart";
import type { CartLineItem } from "@/lib/cart";

/**
 * A single cart line. Source of truth: 05_UX_DESIGN_SPEC.md section 7 — product/variant,
 * quantity, unit and line price, and any availability warning.
 *
 * Quantity changes submit to the server, which revalidates stock and price. A rejection
 * (out of stock, price changed) is rendered inline on the affected line so the customer
 * can see exactly which item changed.
 */
export function CartLine({ item }: { item: CartLineItem }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_previous, formData) =>
      formData.get("intent") === "remove"
        ? removeLineAction(formData)
        : updateQuantityAction(formData),
    null,
  );

  const handle = item.variant?.product?.handle;

  return (
    <li className="flex flex-col gap-3 py-5">
      <div className="flex gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-sunken)]">
          {item.thumbnail && (
            <Image
              src={item.thumbnail}
              alt=""
              aria-hidden="true"
              width={96}
              height={96}
              className="h-full w-full object-contain p-2"
            />
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1">
          <p className="font-medium">
            {handle ? (
              <Link href={`/p/${handle}`} className="hover:underline">
                {item.variant?.product?.title ?? item.title}
              </Link>
            ) : (
              item.title
            )}
          </p>
          {item.variant?.title && (
            <p className="text-sm text-[var(--text-muted)]">
              {item.variant.title}
              {item.variant.sku && ` · SKU ${item.variant.sku}`}
            </p>
          )}
          <p className="font-mono text-sm text-[var(--text-muted)]">
            {formatPkr(item.unit_price)} each
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <p className="font-mono font-semibold">{formatPkr(item.total)}</p>
        </div>
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="line_id" value={item.id} />

        <label htmlFor={`qty-${item.id}`} className="text-sm">
          Quantity
        </label>
        <input
          id={`qty-${item.id}`}
          name="quantity"
          type="number"
          min={1}
          max={10}
          defaultValue={item.quantity}
          inputMode="numeric"
          className="min-h-[40px] w-16 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-2 text-center font-mono"
        />
        <button
          type="submit"
          name="intent"
          value="update"
          disabled={pending}
          className="min-h-[40px] rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 text-sm hover:bg-[var(--surface-sunken)] disabled:opacity-60"
        >
          {pending ? "Updating…" : "Update"}
        </button>
        <button
          type="submit"
          name="intent"
          value="remove"
          disabled={pending}
          className="min-h-[40px] px-2 text-sm underline underline-offset-4 hover:text-[var(--color-danger)] disabled:opacity-60"
        >
          Remove
        </button>
      </form>

      {state && !state.ok && (
        <InlineAlert tone={state.code === "OUT_OF_STOCK" ? "warning" : "danger"}>
          {state.message}
        </InlineAlert>
      )}
    </li>
  );
}
