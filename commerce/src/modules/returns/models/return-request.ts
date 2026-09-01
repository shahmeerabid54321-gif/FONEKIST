import { model } from "@medusajs/framework/utils";
import { ReturnItem } from "./return-item";

/**
 * A customer's return request. Source of truth: 08_DATA_MODEL.md section 13.
 *
 * Deliberately separate from Medusa's own Return, which models the merchant-side operation
 * of receiving goods back. This is the customer's *request* — the thing a human reviews,
 * with the reason, the resolution asked for and the decision recorded against it. Approving
 * one is what creates the operational return.
 *
 * Keeping the request even after it is rejected is the point: "why was my return refused"
 * is the question support cannot answer without it.
 */
export const ReturnRequest = model
  // Table named `rma_*` rather than `return_*`: Medusa's order module already owns
  // `return` and `return_item`, and a silent name collision means `create table if not
  // exists` quietly does nothing and the migration fails on the next statement.
  .define("rma_request", {
    id: model.id({ prefix: "retreq" }).primaryKey(),
    order_id: model.text(),
    /** Shown to the customer; never a sequential internal id (API contract section 4). */
    order_reference: model.text(),
    customer_id: model.text().nullable(),
    status: model
      .enum(["requested", "approved", "rejected", "received", "completed", "cancelled"])
      .default("requested"),
    reason_code: model.text(),
    /** The customer's own words. Kept verbatim: paraphrasing a complaint loses the complaint. */
    notes: model.text().nullable(),
    requested_resolution: model.enum(["refund", "replacement", "repair"]).default("refund"),
    reviewed_at: model.dateTime().nullable(),
    reviewed_by: model.text().nullable(),
    decision_reason: model.text().nullable(),
    items: model.hasMany(() => ReturnItem, { mappedBy: "request" }),
  })
  .indexes([{ on: ["order_id"] }, { on: ["status"] }]);
