import { model } from "@medusajs/framework/utils";
import { WarrantyPolicy } from "./warranty-policy";

/**
 * Binds a warranty policy to a product, or to a single variant when variants differ.
 * Source of truth: 08_DATA_MODEL.md section 8.
 */
export const ProductWarrantyAssignment = model
  .define("product_warranty_assignment", {
    id: model.id({ prefix: "warasn" }).primaryKey(),
    product_id: model.text(),
    /** Null means the assignment covers every variant of the product. */
    variant_id: model.text().nullable(),
    policy: model.belongsTo(() => WarrantyPolicy, { mappedBy: "assignments" }),
  })
  .indexes([
    { on: ["product_id"] },
    { on: ["product_id", "variant_id"], unique: true },
  ]);
