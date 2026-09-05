import type { Route } from "next";
import { ErrorState } from "./ui";

/**
 * What a catalogue page shows when commerce cannot be reached.
 *
 * Never an empty grid. "0 phones" is a claim about the shop, and printing it because a
 * request timed out tells a customer we sell nothing, which is both false and the most
 * expensive thing this page could say. `ErrorState` exists precisely so a failure is not
 * read as an answer.
 *
 * The retry is a plain anchor rather than a `Link` on purpose: what is needed is a fresh
 * request to the server, and a client-side navigation to the URL we are already on is not
 * one.
 */
export function CatalogUnavailable({ retryHref }: { retryHref: Route }) {
  return (
    <ErrorState
      title="We could not reach the catalogue"
      description="This is our end, not yours. The phones and their plans are all still here. Try again in a moment."
      retry={
        <a
          href={retryHref}
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-chip)] border border-[var(--line-strong)] bg-[var(--surface-raised)] px-6 text-sm font-medium text-[var(--text)]"
        >
          Try again
        </a>
      }
    />
  );
}
