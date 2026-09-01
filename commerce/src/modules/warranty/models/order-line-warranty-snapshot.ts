import { model } from "@medusajs/framework/utils";

/**
 * Purchase-time warranty snapshot. Source of truth: WAR-001 and 08_DATA_MODEL.md section 8.
 *
 * NON-NEGOTIABLE: these rows are written once, when the order completes, and are never
 * updated. Catalog edits must not rewrite a historical promise. The service enforces this;
 * see `snapshotOrderLine`.
 *
 * The policy fields are copied by value, not referenced, precisely so that deleting or
 * editing the source policy cannot change what this order line says.
 */
export const OrderLineWarrantySnapshot = model
  .define("order_line_warranty_snapshot", {
    id: model.id({ prefix: "warsnap" }).primaryKey(),
    order_id: model.text(),
    order_line_id: model.text().unique(),

    /** Copied by value at purchase time. */
    type: model.enum(["manufacturer", "distributor", "shop", "none"]),
    provider_name: model.text().nullable(),
    duration_value: model.number().default(0),
    duration_unit: model.enum(["day", "month", "year"]),
    coverage_summary: model.text(),
    claim_instructions: model.text(),
    terms_reference: model.text().nullable(),
    terms_version: model.text(),
    /** Human-readable label as shown to the customer, e.g. "1-year manufacturer warranty". */
    label: model.text(),

    /** Kept for traceability only; the snapshot never reads through it. */
    source_policy_id: model.text().nullable(),
  })
  .indexes([{ on: ["order_id"] }]);
