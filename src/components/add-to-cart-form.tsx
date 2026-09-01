"use client";

import Link from "next/link";
import { useActionState } from "react";
import { addToCartAction, type ActionResult } from "@/app/actions/cart";
import { Button, InlineAlert } from "./ui";

/**
 * Add to cart.
 *
 * A client component because it needs pending state: the tap has to be acknowledged
 * immediately, and a button that looks inert for 400 ms gets pressed twice.
 *
 * Errors from commerce, especially out of stock and a changed price, are rendered inline
 * rather than thrown. They are recoverable and the customer has to see them right here
 * before they can do anything about it (ADR-014).
 */
export function AddToCartForm({
  variantId,
  disabled,
  disabledReason,
}: {
  variantId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_previous, formData) => addToCartAction(formData),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="variant_id" value={variantId} />
      {/*
        Quantity is fixed at one and not offered as a control. This is a phone shop: nobody
        buys three of the same handset in one order, and an installment application is
        limited to one anyway (INST-005), so a quantity field would exist only to be wrong.
      */}
      <input type="hidden" name="quantity" value={1} />

      <Button
        type="submit"
        loading={pending}
        loadingLabel="Adding"
        disabled={disabled}
        className="w-full"
      >
        {disabled ? (disabledReason ?? "Unavailable") : "Add to cart"}
      </Button>

      {state && !state.ok && (
        <InlineAlert tone={state.code === "OUT_OF_STOCK" ? "warning" : "danger"}>
          {state.message}
        </InlineAlert>
      )}

      {state?.ok && (
        <InlineAlert tone="success">
          Added to your cart.{" "}
          <Link href="/cart" className="underline">
            View cart
          </Link>
        </InlineAlert>
      )}
    </form>
  );
}
