import { cookies } from "next/headers";
import {
  MAX_QUERY,
  QUERY_COOKIE,
  QUERY_COOKIE_MAX_AGE,
  QUERY_COUNT_COOKIE,
} from "./query-shared";

// Re-exported so server callers keep importing the query from one place.
export { MAX_QUERY, QUERY_COUNT_COOKIE as QUERY_COUNT_COOKIE_NAME };

/**
 * The query: a shortlist of handsets and the plan chosen for each.
 *
 * This storefront sells on installments only. Nothing is ever bought here, so there is no
 * cart: an application is reviewed by a person and the sale is closed off the website. What
 * a customer builds while browsing is a shortlist of plans to choose between, and choosing
 * one is what starts an application.
 *
 * **Why a cookie rather than `localStorage`.** The comparison tray next door
 * (`components/compare-tray.tsx`) keeps its shortlist in `localStorage`, and that is the
 * wrong shape here for two reasons:
 *
 *  - `/query` must print live figures. Storing a monthly amount or a total would put a
 *    stale price on screen as a statement of fact, and price is never decided here
 *    (ADR-014). Only identifiers are stored; every rupee figure on `/query` is re-read from
 *    commerce through `listPlans` at render time.
 *  - The header count is a server render. It was already a suspended cookie read when it
 *    was a cart badge, and keeping it one means no client store in the header and no
 *    hydration flicker on every page of the site.
 *
 * httpOnly, because no client script has any reason to read it and a capability that can be
 * read can be forged.
 *
 * Every failure path returns an empty list. A malformed cookie, a truncated one, or a shape
 * from an older build must not throw inside a header that renders on every page.
 */

/*
 * `QUERY_COOKIE`, `QUERY_COUNT_COOKIE`, `QUERY_COOKIE_MAX_AGE` and `MAX_QUERY` are in
 * `query-shared.ts`, because the header badge needs two of them in the browser and this
 * module cannot go there: it imports `next/headers`.
 *
 * **Why there are two cookies.** The badge used to be a server render of `queryCount()`, and
 * reading a cookie on the server makes the page that does it dynamic. Because the header is
 * on every page, that one read meant not a single page on this site could be static:
 * measured, it was the difference between roughly 80 and roughly 1,200 requests a second,
 * and between a document a CDN may cache and one marked `private, no-store`.
 *
 * So the count moved to the browser and the shortlist did not. `fk_query` keeps the handles,
 * variant ids and plan ids and stays `httpOnly`, because that is the capability and a
 * capability that can be read can be forged. `fk_query_n` holds an integer from zero to
 * three, which is not: knowing you have two phones shortlisted lets a script do nothing it
 * could not already do. `writeQuery` is the only place either is set, so they cannot drift.
 */

export interface QueryEntry {
  h: string;
  v: string;
  p: string;
}

function isEntry(value: unknown): value is QueryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.h === "string" &&
    typeof entry.v === "string" &&
    typeof entry.p === "string" &&
    entry.h.length > 0 &&
    entry.v.length > 0 &&
    entry.p.length > 0
  );
}

/** The current query. Empty for a missing, malformed or unreadable cookie. */
export async function readQuery(): Promise<QueryEntry[]> {
  const store = await cookies();
  const raw = store.get(QUERY_COOKIE)?.value;
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(0, MAX_QUERY);
  } catch {
    // A cookie from an older build, or one a proxy truncated. An empty shortlist is the
    // correct answer to both, and it is not worth an error boundary on every page.
    return [];
  }
}

/**
 * Replaces the query.
 *
 * Only callable where cookies are writable, which means a Server Action. Writing an empty
 * list deletes the cookie rather than storing `[]`, so a customer who clears their query
 * stops carrying one around.
 */
export async function writeQuery(entries: QueryEntry[]): Promise<void> {
  const store = await cookies();
  const capped = entries.slice(0, MAX_QUERY);

  if (capped.length === 0) {
    store.delete(QUERY_COOKIE);
    store.delete(QUERY_COUNT_COOKIE);
    return;
  }

  store.set(QUERY_COOKIE, JSON.stringify(capped), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: QUERY_COOKIE_MAX_AGE,
    path: "/",
  });

  // Readable, and only ever a number. See the note beside QUERY_COUNT_COOKIE.
  store.set(QUERY_COUNT_COOKIE, String(capped.length), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: QUERY_COOKIE_MAX_AGE,
    path: "/",
  });
}

/**
 * How many handsets are on the query.
 *
 * Server-side, and no longer used by the header: the badge reads `fk_query_n` in the browser
 * so that pages stay static. Kept because it is the authoritative count, derived from the
 * shortlist itself rather than from the mirror, and it is the right thing for any server
 * code that needs the number without trusting a client-readable cookie.
 */
export async function queryCount(): Promise<number> {
  return (await readQuery()).length;
}
