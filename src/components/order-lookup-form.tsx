"use client";

import { useActionState } from "react";
import { Button, InlineAlert, PhoneField, TextField } from "@/components/ui";
import { lookupOrderAction, type LookupState } from "@/app/actions/order-lookup";

export function OrderLookupForm() {
  const [state, formAction, pending] = useActionState<LookupState | null, FormData>(
    lookupOrderAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        id="reference"
        name="reference"
        label="Order reference"
        placeholder="1042"
        required
        inputMode="numeric"
        hint="The number shown on your confirmation, with or without the #."
      />
      <PhoneField
        id="lookup-phone"
        name="phone"
        label="Mobile number on your application"
        required
        hint="We use this to confirm the order is yours."
      />

      {state && !state.ok && <InlineAlert tone="danger">{state.message}</InlineAlert>}

      <Button type="submit" loading={pending} loadingLabel="Looking up your order">
        Find my order
      </Button>
    </form>
  );
}
