"use server";

import { randomUUID } from "node:crypto";
import { AppError, IDEMPOTENCY_KEY_HEADER } from "@/lib/pk";
import { getOrCreateBasket, addLineItem, getBasket } from "@/lib/reservation";
import { medusaFetch } from "@/lib/medusa";
import { log } from "@/lib/log";

/**
 * The installment application Server Action.
 *
 * Everything that decides anything happens in commerce: the plan is revalidated, the cart
 * shape is enforced, the documents are checked, the order is placed with its payment
 * authorisation deferred, and the stock is held. This action assembles the request and
 * reports the answer.
 *
 * It does two things that are its own responsibility:
 *
 *  - **It mints the idempotency key.** A double-tapped submit on a slow connection is the
 *    normal case, not the exotic one, and without a key it would produce two applications,
 *    two orders and two reservations (INST-007).
 *  - **It never returns the submitted data back to the browser.** The result carries the
 *    reference and the state, and nothing else. A CNIC that went up must not come back down
 *    in a response payload (ADR-024).
 */

export interface ApplicationResult {
  ok: boolean;
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  reference?: string;
  state?: string;
  reservedUntil?: string;
}

export async function submitApplicationAction(
  _previous: ApplicationResult | null,
  formData: FormData,
): Promise<ApplicationResult> {
  const value = (key: string): string => String(formData.get(key) ?? "").trim();

  const variantId = value("variant_id");
  const planId = value("plan_id");
  const documentIds = String(formData.get("document_ids") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!variantId || !planId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Start again from the phone you want." };
  }

  if (documentIds.length < 4) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Upload both sides of your CNIC and both sides of your guarantor's CNIC.",
    };
  }

  if (formData.get("consent") !== "on") {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "You need to accept the terms before we can take your application.",
    };
  }

  try {
    /*
     * The reservation basket is built here rather than assumed.
     *
     * An installment agreement covers one handset (INST-005), and commerce refuses anything
     * else. This is the only place in the storefront that touches a Medusa cart: the
     * customer's shortlist is the query, which holds identifiers and no basket at all, so
     * the basket is assembled at the last moment with exactly the variant being applied for
     * and its shape is right by construction.
     */
    const existing = await getBasket();
    const alreadyCorrect =
      existing?.items.length === 1 &&
      existing.items[0]?.variant_id === variantId &&
      existing.items[0]?.quantity === 1;

    const basket = alreadyCorrect ? existing : await getOrCreateBasket();
    if (!alreadyCorrect) {
      await addLineItem(variantId, 1);
    }

    const payload = {
      cart_id: basket.id,
      plan_id: planId,
      applicant: {
        full_name: value("applicant_name"),
        cnic: value("applicant_cnic"),
        phone: value("applicant_phone"),
        email: value("applicant_email"),
        date_of_birth: value("applicant_dob"),
        employment_type: value("employment_type"),
        employer_name: value("employer_name") || undefined,
        monthly_income_pkr: Number(value("monthly_income")) || 0,
        address: {
          full_name: value("applicant_name"),
          phone: value("applicant_phone"),
          province: value("province"),
          city: value("city"),
          area: value("area"),
          street: value("street"),
          landmark: value("landmark") || undefined,
        },
      },
      guarantor: {
        full_name: value("guarantor_name"),
        cnic: value("guarantor_cnic"),
        phone: value("guarantor_phone"),
        relationship: value("guarantor_relationship"),
      },
      document_ids: documentIds,
      consent: { accepted: true as const, terms_version: value("terms_version") },
    };

    const result = await medusaFetch<{
      data: { reference: string; state: string; reserved_until: string };
    }>("/store/installment-applications", {
      method: "POST",
      headers: { [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
      body: JSON.stringify(payload),
      cache: "no-store",
      // Placing the order and reserving stock is slower than a read.
      timeoutMs: 30_000,
    });

    return {
      ok: true,
      reference: result.data.reference,
      state: result.data.state,
      reservedUntil: result.data.reserved_until,
    };
  } catch (error) {
    const appError = AppError.from(error);
    /*
     * Logged with the operation and the error code only.
     *
     * The payload is deliberately not attached. `log.ts` redacts by key name, which would
     * catch `email` and `phone` but not `applicant_cnic`, and relying on a redactor to know
     * every field name is how identity data reaches a log file (ADR-024).
     */
    log.warn("Installment application failed", { operation: "installments.submit" }, appError);

    const internal = appError.internal as { body?: { error?: { field_errors?: Record<string, string[]> } } };

    return {
      ok: false,
      code: appError.code,
      message: appError.message,
      fieldErrors: internal?.body?.error?.field_errors,
    };
  }
}
