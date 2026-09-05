"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { MAX_QUERY, QUERY_COUNT_COOKIE } from "@/lib/query-shared";
import { IconQuery } from "./icons";

/**
 * The header's query badge.
 *
 * **Why this is a client component.** It used to be an async server component reading the
 * query cookie, suspended so that "the count, and only the count, is what makes a page
 * dynamic". That was the right intent and, once Partial Prerendering was switched on, it
 * even became true. It was still too expensive: a dynamic hole in the header is a dynamic
 * hole in every page on the site, which means every document is assembled per request and
 * marked `private, no-store` so no CDN may keep it. Measured against this build, that one
 * badge was the difference between roughly 80 and roughly 1,200 requests a second.
 *
 * Reading the number in the browser instead costs nothing and loses nothing, because the
 * badge already arrived a beat after the page: it was behind a `<Suspense>` boundary whose
 * fallback was the same link without a number. The sequence a customer sees is unchanged.
 *
 * The store is the same shape as the comparison tray's next door, and for the same reason:
 * the badge sits in the layout and the things that change it sit in pages, so the two are
 * never in one subtree and cannot share a provider without making the whole app a client
 * component.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot = 0;

function read(): number {
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${QUERY_COUNT_COOKIE}=([^;]*)`),
    );
    if (!match?.[1]) return 0;
    const value = Number(decodeURIComponent(match[1]));
    // A cookie is user-editable text. Anything that is not a plain integer in range is
    // treated as no shortlist rather than rendered, because this number is drawn on screen.
    if (!Number.isInteger(value) || value < 0) return 0;
    return Math.min(value, MAX_QUERY);
  } catch {
    // Cookies disabled, or a document that will not let us look. No badge is the honest
    // answer to both.
    return 0;
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Re-reads the cookie and tells every badge on the page.
 *
 * Exported because a Server Action cannot reach this store: `addToQueryAction` sets the
 * cookie on the response, and the form that called it calls this afterwards so the header
 * updates without a navigation.
 */
export function refreshQueryCount(): void {
  const next = read();
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function useQueryCount(): number {
  const count = useSyncExternalStore(
    subscribe,
    () => snapshot,
    // The server has no cookie access here, so it renders zero and the first client render
    // agrees with it. The effect below fills in the real number immediately after.
    () => 0,
  );

  useEffect(() => {
    refreshQueryCount();
    // Another tab may have changed the shortlist while this one sat in the background, and
    // a cookie fires no event of its own.
    const onFocus = () => refreshQueryCount();
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, []);

  return count;
}

export function QueryBadgeLink() {
  const count = useQueryCount();

  return (
    <Link
      href="/query"
      className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--radius-chip)] bg-[var(--text)] px-5 text-sm font-semibold text-[var(--surface)] transition-opacity duration-200 [transition-timing-function:var(--ease-brand)] hover:opacity-90"
    >
      <IconQuery />
      Query
      {count > 0 && (
        <>
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--surface)] px-1 font-mono text-[11px] text-[var(--text)]">
            {count}
          </span>
          <span className="sr-only">phones</span>
        </>
      )}
    </Link>
  );
}
