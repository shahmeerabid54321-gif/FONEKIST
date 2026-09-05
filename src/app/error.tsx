"use client";

import { Button } from "@/components/ui";

/**
 * Route error boundary.
 *
 * Always recoverable, because Next gives us a reset handler. The copy says the query is safe
 * because that is the first thing somebody worries about when a shop page breaks, and it is
 * true: the query lives in an httpOnly cookie, not in this render.
 */
export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 sm:px-8">
      <h1 className="text-2xl font-semibold text-[var(--text)]">
        We could not load this page
      </h1>
      <p className="mt-3 text-[var(--text-soft)]">
        Something went wrong at our end. Your query is safe.
      </p>
      <div className="mt-6">
        <Button tone="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
