"use client";

import { useActionState } from "react";
import { Button, InlineAlert } from "@/components/ui";
import { checkPendingOrderAction, type CheckoutState } from "@/app/actions/checkout";

/**
 * "Check again" for a payment whose outcome is unknown.
 *
 * Deliberately a button rather than a polling loop. Polling a payment status endpoint from
 * every open tab is how a provider rate-limits you during an incident, and a customer who
 * has just possibly been charged wants a control they trust more than a spinner that might
 * be doing nothing.
 */
export function PendingPaymentCheck() {
  const [state, check, checking] = useActionState<CheckoutState | null, FormData>(
    () => checkPendingOrderAction(),
    null,
  );

  return (
    <form action={check} className="flex flex-col gap-4">
      <Button type="submit" loading={checking} loadingLabel="Checking with the provider">
        Check payment status
      </Button>

      {state && !state.ok && (
        <InlineAlert tone={state.code === "PAYMENT_PENDING" ? "warning" : "danger"}>
          {state.message}
        </InlineAlert>
      )}
    </form>
  );
}
