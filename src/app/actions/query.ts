"use server";

import { revalidatePath } from "next/cache";
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
 * Revalidates the pages a change to the query is visible on.
 *
 * The layout revalidation is for the header count, which renders on every page. Without it
 * the badge stays a step behind and reports a shortlist the customer has already changed.
 */
function revalidateQuery(): void {
  revalidatePath("/query");
  revalidatePath("/", "layout");
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
