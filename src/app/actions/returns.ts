"use server";

import { AppError, type FieldErrors } from "@/lib/pk";
import { requestReturn } from "@/lib/orders";
import { log } from "@/lib/log";

/**
 * Return request action.
 *
 * The phone number is asked for again rather than read from the order: this form is
 * reachable from an order page whose URL is the only thing guarding it, so the second
 * factor has to be something the requester actually knows (SEC-004, ADR-008).
 */

export interface ReturnState {
  ok: boolean;
  code?: string;
  message?: string;
  fieldErrors?: FieldErrors;
}

export async function requestReturnAction(
  _previous: ReturnState | null,
  formData: FormData,
): Promise<ReturnState> {
  const orderReference = String(formData.get("order_reference") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const reasonCode = String(formData.get("reason_code") ?? "");
  const requestedResolution = String(formData.get("requested_resolution") ?? "refund");
  const notes = String(formData.get("notes") ?? "").trim();

  const items = formData
    .getAll("line_id")
    .map((value) => String(value))
    .filter(Boolean)
    .map((lineId) => ({
      order_line_id: lineId,
      quantity: Number(formData.get(`quantity_${lineId}`) ?? 0),
    }))
    .filter((item) => item.quantity > 0);

  if (items.length === 0) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Choose at least one item to return." };
  }
  if (!phone) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Enter the mobile number used on the order so we can confirm it is yours.",
    };
  }

  try {
    await requestReturn({ orderReference, phone, reasonCode, requestedResolution, notes, items });
  } catch (error) {
    const appError = AppError.from(error);
    log.warn("Return request failed", { operation: "returns.request" }, appError);
    return { ok: false, code: appError.code, message: appError.message };
  }

  return {
    ok: true,
    message: "Return requested. We will review it and email you what happens next.",
  };
}
