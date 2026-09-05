"use client";

import { useActionState } from "react";
import { clearQueryAction, removeFromQueryAction, type ActionResult } from "@/app/actions/query";
import { Button, InlineAlert } from "./ui";
import { refreshQueryCount } from "./query-badge";
import { IconClose } from "./icons";

/**
 * Removing one phone from the query.
 *
 * A form rather than a button with an onClick, so it works before hydration and with
 * JavaScript off. The pending state matters here for the same reason it does on the add
 * control: a row that looks inert while the server thinks gets pressed again.
 */
export function RemoveFromQueryButton({ variantId }: { variantId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_previous, formData) => {
      const result = await removeFromQueryAction(formData);
      if (result.ok) refreshQueryCount();
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="variant_id" value={variantId} />
      <Button type="submit" tone="quiet" loading={pending} loadingLabel="Removing">
        <IconClose />
        Remove
      </Button>
      {state && !state.ok && <InlineAlert tone="danger">{state.message}</InlineAlert>}
    </form>
  );
}

/** Empties the query. Only rendered when there is something to empty. */
export function ClearQueryButton() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async () => {
      const result = await clearQueryAction();
      if (result.ok) refreshQueryCount();
      return result;
    },
    null,
  );

  return (
    <form action={formAction}>
      <Button type="submit" tone="quiet" loading={pending} loadingLabel="Clearing">
        Clear query
      </Button>
      {state && !state.ok && <InlineAlert tone="danger">{state.message}</InlineAlert>}
    </form>
  );
}
