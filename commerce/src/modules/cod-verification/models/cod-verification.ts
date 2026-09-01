import { model } from "@medusajs/framework/utils";

/**
 * A cash-on-delivery verification challenge. Source of truth: 08_DATA_MODEL.md section 12.
 *
 * COD is the dominant payment method in this market and also the one that carries the
 * merchant's whole risk: an unverified order that is refused at the door costs two courier
 * legs and the goods' time off the shelf. Verifying the phone number before dispatch is
 * the cheapest honest control — it is not fraud scoring, and section 12 explicitly warns
 * against opaque scoring without clear purpose.
 *
 * The code itself is never stored. Only an HMAC of it is, so a database read cannot be
 * turned into a working confirmation code.
 */
export const CodVerification = model
  .define("cod_verification", {
    id: model.id({ prefix: "codver" }).primaryKey(),
    /** The cart being checked out. Verification happens before an order exists. */
    cart_id: model.text(),
    /** Set once the order is placed, so operations can trace a challenge to an order. */
    order_id: model.text().nullable(),
    /** E.164. Needed to deliver the code; never written to a log (TRD section 13). */
    phone: model.text(),
    /** HMAC-SHA256 of the code under a server secret. The code is never persisted. */
    code_hash: model.text(),
    method: model.enum(["otp", "call", "none"]).default("otp"),
    status: model.enum(["not_required", "pending", "verified", "failed", "expired"]).default("pending"),
    attempts: model.number().default(0),
    max_attempts: model.number().default(5),
    expires_at: model.dateTime(),
    verified_at: model.dateTime().nullable(),
    /** Why a challenge ended the way it did, for operations rather than for the customer. */
    reason_code: model.text().nullable(),
  })
  .indexes([{ on: ["cart_id"] }, { on: ["status"] }, { on: ["order_id"] }]);
