"use client";

import Link from "next/link";
import { useActionState } from "react";
import { addToQueryAction, type ActionResult } from "@/app/actions/query";
import { Button, InlineAlert } from "./ui";

/**
 * Add to query.
 *
 * A client component because it needs pending state: the tap has to be acknowledged
 * immediately, and a button that looks inert for 400 ms gets pressed twice.
 *
 * This is the secondary action on the panel, never the way in to an application. "Apply for
 * this plan" sits above it and goes straight to the form, so a customer whose browser
 * refuses cookies still has the whole flow available to them; all they lose is the
 * shortlist.
 */
export function AddToQueryForm({
  handle,
  variantId,
  planId,
  disabled,
  disabledReason,
}: {
  handle: string;
  variantId: string;
  planId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_previous, formData) => addToQueryAction(formData),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="variant_id" value={variantId} />
      {/*
        The plan travels with the phone. A query row is a handset *and* the plan chosen for
        it, because an application is for one specific plan on one specific handset and a
        shortlist of bare phones would lose the only decision the customer has made.
      */}
      <input type="hidden" name="plan_id" value={planId} />

      <Button
        type="submit"
        tone="secondary"
        loading={pending}
        loadingLabel="Adding"
        disabled={disabled}
        className="w-full"
      >
        {disabled ? (disabledReason ?? "Unavailable") : "Add to query"}
      </Button>

      {state && !state.ok && (
        <InlineAlert tone={state.code === "VALIDATION_ERROR" ? "warning" : "danger"}>
          {state.message}
        </InlineAlert>
      )}

      {state?.ok && (
        <InlineAlert tone="success">
          On your query.{" "}
          <Link href="/query" className="underline">
            View query
          </Link>
        </InlineAlert>
      )}
    </form>
  );
}
