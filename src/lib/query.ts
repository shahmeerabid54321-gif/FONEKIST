import { cookies } from "next/headers";

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

const QUERY_COOKIE = "fk_query";
const QUERY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Three, and there is no reward for filling it.
 *
 * An agreement covers exactly one handset (INST-005), so the query exists to choose between
 * a few phones, not to accumulate them: a fourth row would be a basket pretending to be a
 * decision. Three also keeps every row's full disclosure block, which is five figures and a
 * comparison, readable on a phone screen. The cap is a consequence of the layout and the
 * contract, not a target (ADR-003).
 */
export const MAX_QUERY = 3;

/**
 * One shortlisted handset.
 *
 * Short keys because this lives in a cookie that is sent with every request. `h` is the
 * product handle, `v` the variant id, `p` the plan id. Nothing here is a price, a title or
 * anything else that could go stale: those are all re-read at render.
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
    return;
  }

  store.set(QUERY_COOKIE, JSON.stringify(capped), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: QUERY_COOKIE_MAX_AGE,
    path: "/",
  });
}

/** How many handsets are on the query. Used by the header badge. */
export async function queryCount(): Promise<number> {
  return (await readQuery()).length;
}
