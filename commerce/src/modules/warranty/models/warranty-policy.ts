import { model } from "@medusajs/framework/utils";
import { ProductWarrantyAssignment } from "./product-warranty-assignment";

/**
 * A reusable warranty policy. Source of truth: 08_DATA_MODEL.md section 8.
 *
 * CUST-008 requires every published product to carry an explicit warranty — including an
 * explicit `none`. There is no implicit "unknown" state.
 */
export const WarrantyPolicy = model.define("warranty_policy", {
  id: model.id({ prefix: "warpol" }).primaryKey(),
  name: model.text().searchable(),
  type: model.enum(["manufacturer", "distributor", "shop", "none"]),
  provider_name: model.text().nullable(),
  duration_value: model.number().default(0),
  duration_unit: model.enum(["day", "month", "year"]),
  coverage_summary: model.text(),
  claim_instructions: model.text(),
  terms_reference: model.text().nullable(),
  /**
   * Bumped whenever the policy text changes. The snapshot records the version in force at
   * purchase time so a later edit is provably not what the customer was promised.
   */
  terms_version: model.text().default("v1"),
  customer_pays_shipping: model.boolean().nullable(),
  active: model.boolean().default(true),
  assignments: model.hasMany(() => ProductWarrantyAssignment, { mappedBy: "policy" }),
});
