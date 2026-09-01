"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/pk";
import {
  addLineItem,
  applyPromotion,
  removeLineItem,
  removePromotion,
  updateLineItem,
} from "@/lib/cart";
import { log } from "@/lib/log";
import { dynamicRoute } from "@/lib/routes";

/**
 * Cart Server Actions.
 *
 * These are the only write path from the storefront into the cart. Each one returns a
 * plain result object rather than throwing, so the calling form can render a recoverable
 * error inline (UX spec section 7) instead of tripping the route error boundary.
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

export async function addToCartAction(formData: FormData): Promise<ActionResult> {
  const variantId = String(formData.get("variant_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const redirectTo = formData.get("redirect_to");

  if (!variantId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Choose an option before adding to cart." };
  }

  try {
    await addLineItem(variantId, Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  } catch (error) {
    return toResult(error, "cart.add");
  }

  revalidatePath("/cart");
  // The redirect must sit outside the try block: Next signals redirects by throwing, and
  // catching it here would turn a successful add into a reported failure.
  if (typeof redirectTo === "string" && redirectTo) redirect(dynamicRoute(redirectTo));

  return { ok: true };
}

export async function updateQuantityAction(formData: FormData): Promise<ActionResult> {
  const lineId = String(formData.get("line_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);

  if (!lineId) return { ok: false, code: "VALIDATION_ERROR", message: "Missing cart line." };

  try {
    await updateLineItem(lineId, quantity);
  } catch (error) {
    return toResult(error, "cart.update");
  }

  revalidatePath("/cart");
  return { ok: true };
}

export async function removeLineAction(formData: FormData): Promise<ActionResult> {
  const lineId = String(formData.get("line_id") ?? "");
  if (!lineId) return { ok: false, code: "VALIDATION_ERROR", message: "Missing cart line." };

  try {
    await removeLineItem(lineId);
  } catch (error) {
    return toResult(error, "cart.remove");
  }

  revalidatePath("/cart");
  return { ok: true };
}

/**
 * Applies a promotion code.
 *
 * A code that does not apply is reported plainly rather than silently ignored. Quietly
 * accepting an invalid code and showing no discount is the behaviour that makes customers
 * abandon a checkout convinced the site is broken (UX spec section 7).
 */
export async function applyPromotionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const code = String(formData.get("promo_code") ?? "").trim();
  if (!code) return { ok: false, code: "VALIDATION_ERROR", message: "Enter a promotion code." };

  let cart;
  try {
    cart = await applyPromotion(code);
  } catch (error) {
    const appError = AppError.from(error);
    // Medusa answers an unknown code with a validation error; the customer needs to know
    // the code is wrong, not that "something went wrong".
    if (appError.code === "VALIDATION_ERROR" || appError.code === "NOT_FOUND") {
      return { ok: false, code: appError.code, message: `“${code}” is not a valid promotion code.` };
    }
    return toResult(appError, "cart.applyPromotion");
  }

  const applied = cart.promotions?.some(
    (promotion) => promotion.code?.toLowerCase() === code.toLowerCase(),
  );

  revalidatePath("/cart");

  // Medusa accepts the request even when the code does not apply to this cart, so the
  // result is checked rather than assumed.
  if (!applied) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `“${code}” does not apply to the items in your cart.`,
    };
  }

  return { ok: true, message: `Promotion “${code}” applied.` };
}

export async function removePromotionAction(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const code = String(formData.get("promo_code") ?? "").trim();
  if (!code) return { ok: false, code: "VALIDATION_ERROR", message: "Missing promotion code." };

  try {
    await removePromotion(code);
  } catch (error) {
    return toResult(error, "cart.removePromotion");
  }

  revalidatePath("/cart");
  return { ok: true };
}
