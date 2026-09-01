"use server";

import { redirect } from "next/navigation";
import { AppError, pkMobileSchema } from "@/lib/pk";
import { medusaFetch } from "@/lib/medusa";
import { log } from "@/lib/log";
import { dynamicRoute } from "@/lib/routes";

/**
 * Secure guest order lookup (CUST-018, API contract section 4).
 *
 * Requires the public order reference plus a second factor — the phone number used at
 * checkout. Reference alone is not enough: display ids are sequential and guessable, which
 * is exactly why the contract calls for a second factor.
 */

export interface LookupState {
  ok: boolean;
  message?: string;
}

export async function lookupOrderAction(
  _previous: LookupState | null,
  formData: FormData,
): Promise<LookupState> {
  const reference = String(formData.get("reference") ?? "").trim().replace(/^#/, "");
  const phoneRaw = String(formData.get("phone") ?? "");

  const phone = pkMobileSchema.safeParse(phoneRaw);

  if (!reference || !phone.success) {
    return {
      ok: false,
      message: "Enter the order reference and the mobile number you ordered with.",
    };
  }

  let orderId: string;

  try {
    const response = await medusaFetch<{ data: { order_id: string } }>(
      "/store/orders/lookup",
      {
        method: "POST",
        body: JSON.stringify({ reference, phone: phone.data }),
        cache: "no-store",
      },
    );
    orderId = response.data.order_id;
  } catch (error) {
    const appError = AppError.from(error);
    log.warn("Order lookup rejected", { operation: "order.lookup" }, appError);

    // Deliberately identical for "no such order" and "wrong phone": distinguishing them
    // would turn this form into an oracle for which order references exist.
    return {
      ok: false,
      message:
        appError.code === "RATE_LIMITED"
          ? "Too many attempts. Please wait a few minutes and try again."
          : "We could not find an order matching those details.",
    };
  }

  redirect(dynamicRoute(`/order/${orderId}`));
}
