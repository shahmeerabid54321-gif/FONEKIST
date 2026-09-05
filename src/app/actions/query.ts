"use server";

import { refresh } from "next/cache";
import { AppError } from "@/lib/pk";
import { log } from "@/lib/log";
import { MAX_QUERY, readQuery, writeQuery, type QueryEntry } from "@/lib/query";

/**
 * Query Server Actions.
 *
 * The only write path into the shortlist. Each returns a plain result rather than throwing,
 * so the calling form renders a recoverable problem inline instead of tripping the route
 * error boundary (UX spec section 7).
 *
 * Nothing here talks to commerce. The query holds identifiers and only identifiers; the
 * plan is revalidated against commerce when `/query` renders and again when the application
 * is submitted, which are the two moments the figures actually matter.
 */

export interface ActionResult {
  ok: boolean;
  code?: string;
  message?: string;
}

function toResult(error: unknown, operation: string): ActionResult {
  const appError = AppError.from(error);
  log.warn(`${operation} failed`, { operation }, appError);
  return { ok: false, code: appError.code, message: appError.message };
}

/**
 * Refreshes what a change to the query is visible on.
 *
 * This was `revalidatePath("/query")` plus `revalidatePath("/", "layout")`, and the second
 * one was quietly the most expensive line in the storefront. The header count renders on
 * every page, so invalidating the layout looked like the honest way to keep the badge from
 * lagging. What it actually did was clear the client router cache for the entire site on
 * every add, remove and clear: every link the customer clicked afterwards became a fresh
 * server round trip instead of an instant cached navigation. Adding a phone to a shortlist
 * made the rest of the site slow.
 *
 * `refresh()` is the right tool and exists for exactly this. The badge and `/query` read
 * uncached data — a cookie, and figures re-read from commerce — so there is no cache entry
 * to invalidate here at all. It re-renders the uncached parts of what is on screen and
 * leaves every cached shell, and the client router cache, untouched.
 */
function revalidateQuery(): void {
  refresh();
}

/**
 * Adds a handset and its chosen plan.
 *
 * Adding a variant that is already on the query **replaces its plan** rather than appending
 * a second row. Two plans for one handset is not a shortlist, it is a plan comparison, and
 * the product page already does that better than a list of rows could.
 */
export async function addToQueryAction(formData: FormData): Promise<ActionResult> {
  const handle = String(formData.get("handle") ?? "").trim();
  const variantId = String(formData.get("variant_id") ?? "").trim();
  const planId = String(formData.get("plan_id") ?? "").trim();

  if (!handle || !variantId || !planId) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Choose a plan before adding this phone to your query.",
    };
  }

  try {
    const current = await readQuery();
    const existing = current.findIndex((entry) => entry.v === variantId);
    const entry: QueryEntry = { h: handle, v: variantId, p: planId };

    let next: QueryEntry[];
    if (existing >= 0) {
      next = [...current];
      next[existing] = entry;
    } else {
      if (current.length >= MAX_QUERY) {
        return {
          ok: false,
          code: "VALIDATION_ERROR",
          message: `Your query holds ${MAX_QUERY} phones. Remove one to add another.`,
        };
      }
      next = [...current, entry];
    }

    await writeQuery(next);
  } catch (error) {
    return toResult(error, "query.add");
  }

  revalidateQuery();
  return { ok: true };
}

export async function removeFromQueryAction(formData: FormData): Promise<ActionResult> {
  const variantId = String(formData.get("variant_id") ?? "").trim();
  if (!variantId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Missing phone." };
  }

  try {
    const current = await readQuery();
    await writeQuery(current.filter((entry) => entry.v !== variantId));
  } catch (error) {
    return toResult(error, "query.remove");
  }

  revalidateQuery();
  return { ok: true };
}

export async function clearQueryAction(): Promise<ActionResult> {
  try {
    await writeQuery([]);
  } catch (error) {
    return toResult(error, "query.clear");
  }

  revalidateQuery();
  return { ok: true };
}
