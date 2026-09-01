"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, addressSchema, contactSchema, type FieldErrors } from "@/lib/pk";
import { clearCartId, getCartId, getCart } from "@/lib/cart";
import {
  completeCart,
  completeCodVerification,
  createPaymentSession,
  newIdempotencyKey,
  setContactAndAddress,
  setShippingMethod,
  startCodVerification,
} from "@/lib/checkout";
import { log } from "@/lib/log";
import { dynamicRoute } from "@/lib/routes";

/**
 * Checkout Server Actions.
 *
 * The submit action is the single duplicate-risk write on the storefront. It holds an
 * idempotency key in a cookie for the duration of one checkout attempt, so a retry — a
 * double tap, a flaky connection, a browser back-and-resubmit — reuses the same key and
 * cannot produce a second order (CUST-016).
 */

const IDEMPOTENCY_COOKIE = "pk_checkout_key";

export interface CheckoutState {
  ok: boolean;
  code?: string;
  message?: string;
  fieldErrors?: FieldErrors;
}

async function idempotencyKeyForAttempt(): Promise<string> {
  const store = await cookies();
  const existing = store.get(IDEMPOTENCY_COOKIE)?.value;
  if (existing) return existing;

  const key = newIdempotencyKey();
  store.set(IDEMPOTENCY_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // One checkout attempt. Long enough to survive a payment redirect, short enough that a
    // genuinely new order later gets a fresh key.
    maxAge: 60 * 60,
    path: "/",
  });
  return key;
}

async function clearIdempotencyKey(): Promise<void> {
  const store = await cookies();
  store.delete(IDEMPOTENCY_COOKIE);
}

function fail(error: unknown, operation: string): CheckoutState {
  const appError = AppError.from(error);
  log.warn(`${operation} failed`, { operation }, appError);
  return { ok: false, code: appError.code, message: appError.message };
}

/**
 * Re-checks a payment whose outcome was unknown when the browser came back.
 *
 * ADR-007: the return from a payment provider is not evidence of payment. The only way an
 * order becomes real is commerce accepting the completion, so this re-attempts it with the
 * *same* idempotency key. If the webhook has since confirmed the payment the attempt
 * resolves to the one order that was always going to exist; if it has not, nothing is
 * created and the customer is told to wait rather than shown a failure (CUST-016).
 */
export async function checkPendingOrderAction(): Promise<CheckoutState> {
  const cart = await getCart();
  if (!cart) {
    // The cart is gone, which means completion already succeeded on another attempt.
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "This checkout is already finished. Look up the order with its reference.",
    };
  }

  const store = await cookies();
  const idempotencyKey = store.get(IDEMPOTENCY_COOKIE)?.value;
  if (!idempotencyKey) {
    return {
      ok: false,
      code: "CONFLICT",
      message:
        "We cannot safely re-check this payment from here. Contact support with your details before paying again.",
    };
  }

  let destination: string;

  try {
    const result = await completeCart(cart.id, idempotencyKey);

    if (result.kind !== "order") {
      return {
        ok: false,
        code: "PAYMENT_PENDING",
        message: "Still waiting for the payment provider. Do not pay again.",
      };
    }

    log.info("Pending order resolved", {
      operation: "checkout.checkPending",
      orderId: result.order.id,
      cartId: cart.id,
    });

    await clearCartId();
    await clearIdempotencyKey();
    destination = `/order/${result.order.id}`;
  } catch (error) {
    const appError = AppError.from(error);
    if (appError.isIndeterminate) {
      return {
        ok: false,
        code: appError.code,
        message: "Still waiting for the payment provider. Do not pay again.",
      };
    }
    return fail(appError, "checkout.checkPending");
  }

  redirect(dynamicRoute(destination));
}

/** Saves contact details and the delivery address, then the chosen delivery method. */
export async function saveDetailsAction(
  _previous: CheckoutState | null,
  formData: FormData,
): Promise<CheckoutState> {
  const cartId = await getCartId();
  if (!cartId) return { ok: false, code: "NOT_FOUND", message: "Your cart is empty." };

  const contact = contactSchema.safeParse({
    email: formData.get("email"),
    phone: formData.get("phone"),
  });

  const address = addressSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    province: formData.get("province"),
    city: formData.get("city"),
    area: formData.get("area"),
    street: formData.get("street"),
    landmark: formData.get("landmark") || undefined,
    instructions: formData.get("instructions") || undefined,
  });

  if (!contact.success || !address.success) {
    // Merged so every invalid field is reported at once rather than one per submit.
    const fieldErrors: FieldErrors = {
      ...(contact.success ? {} : (contact.error.flatten().fieldErrors as FieldErrors)),
      ...(address.success ? {} : (address.error.flatten().fieldErrors as FieldErrors)),
    };
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Please correct the highlighted details.",
      fieldErrors,
    };
  }

  try {
    await setContactAndAddress(cartId, { email: contact.data.email, address: address.data });

    const shippingOptionId = String(formData.get("shipping_option_id") ?? "");
    if (shippingOptionId) await setShippingMethod(cartId, shippingOptionId);
  } catch (error) {
    return fail(error, "checkout.saveDetails");
  }

  return { ok: true };
}

/**
 * Places the order.
 *
 * For COD this completes immediately. For an online provider the session is created and
 * completion is attempted; an unresolved payment returns pending rather than failure
 * (ADR-007), and the customer is sent to a status page that reads authoritative order
 * state instead of trusting anything in the URL.
 */
export async function placeOrderAction(
  _previous: CheckoutState | null,
  formData: FormData,
): Promise<CheckoutState> {
  const providerId = String(formData.get("provider_id") ?? "");
  if (!providerId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Choose a payment method." };
  }

  const cart = await getCart();
  if (!cart || cart.items.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: "Your cart is empty." };
  }
  if (!cart.email || !cart.shipping_address) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Add your delivery details first." };
  }
  if ((cart.shipping_methods?.length ?? 0) === 0) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Choose a delivery method." };
  }

  const idempotencyKey = await idempotencyKeyForAttempt();
  let destination: string;

  try {
    await createPaymentSession(cart, providerId, idempotencyKey);
    const result = await completeCart(cart.id, idempotencyKey);

    if (result.kind === "order") {
      log.info("Order placed", {
        operation: "checkout.placeOrder",
        orderId: result.order.id,
        cartId: cart.id,
        provider: providerId,
      });
      await clearCartId();
      await clearIdempotencyKey();
      destination = `/order/${result.order.id}?placed=1`;
    } else {
      // Unknown, not failed. The status page reads the authoritative record (ADR-007).
      log.info("Order completion pending", {
        operation: "checkout.placeOrder",
        cartId: cart.id,
        provider: providerId,
      });
      destination = `/checkout/pending?cart=${cart.id}`;
    }
  } catch (error) {
    const appError = AppError.from(error);

    // An indeterminate outcome keeps the idempotency key so a retry resolves to the same
    // order instead of creating a second one.
    if (appError.isIndeterminate) {
      return {
        ok: false,
        code: appError.code,
        message: "Payment confirmation pending. Do not pay again. Check your order status.",
      };
    }

    await clearIdempotencyKey();
    return fail(appError, "checkout.placeOrder");
  }

  // Outside the try: Next signals redirects by throwing.
  redirect(dynamicRoute(destination));
}

/* ------------------------------------------------------- COD confirmation */

export interface CodVerifyState {
  ok: boolean;
  challengeId?: string;
  maskedDestination?: string;
  attemptsRemaining?: number;
  verified?: boolean;
  message?: string;
}

/**
 * Sends a confirmation code to the phone on the cart.
 *
 * The phone is read from the saved shipping address rather than from the form, so someone
 * cannot have the code sent to a number that is not the one the courier will call
 * (09_API_AND_EVENT_CONTRACTS.md section 4: "uses the checkout-associated phone").
 */
export async function startCodVerificationAction(
  _previous: CodVerifyState | null,
  _formData: FormData,
): Promise<CodVerifyState> {
  const cart = await getCart();
  if (!cart) return { ok: false, message: "Your cart is empty." };

  const phone = (cart.shipping_address as { phone?: string } | null)?.phone;
  if (!phone) {
    return { ok: false, message: "Save your delivery details first so we know where to send the code." };
  }

  try {
    const challenge = await startCodVerification(cart.id, phone);

    if (!challenge.required) return { ok: true, verified: true };

    return {
      ok: true,
      challengeId: challenge.challenge_id,
      maskedDestination: challenge.masked_destination,
      attemptsRemaining: challenge.attempts_remaining,
      message: `We sent a code to ${challenge.masked_destination}.`,
    };
  } catch (error) {
    return fail(error, "checkout.startCodVerification");
  }
}

/** Checks the code the customer entered. */
export async function completeCodVerificationAction(
  _previous: CodVerifyState | null,
  formData: FormData,
): Promise<CodVerifyState> {
  const challengeId = String(formData.get("challenge_id") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!challengeId) return { ok: false, message: "Request a code first." };
  if (!/^\d{4,8}$/.test(code)) return { ok: false, challengeId, message: "Enter the code you received." };

  try {
    const result = await completeCodVerification(challengeId, code);

    if (result.verified) {
      return { ok: true, verified: true, message: "Number confirmed. You can place your order." };
    }

    return {
      ok: false,
      challengeId: result.expired ? undefined : challengeId,
      attemptsRemaining: result.attempts_remaining,
      message: result.expired
        ? "That code has expired. Request a new one."
        : `That code is not right. ${result.attempts_remaining} attempt${
            result.attempts_remaining === 1 ? "" : "s"
          } remaining.`,
    };
  } catch (error) {
    return fail(error, "checkout.completeCodVerification");
  }
}
