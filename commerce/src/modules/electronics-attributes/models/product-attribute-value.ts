import { model } from "@medusajs/framework/utils";
import { AttributeDefinition } from "./attribute-definition";

/**
 * A typed specification value for a product, or for a single variant when the attribute is
 * variant-scoped. Source of truth: 08_DATA_MODEL.md section 6.
 *
 * The value is stored in the column matching its type, plus `value_number` as the
 * normalised numeric form used for range filters and sorting. Data model principle 5:
 * normalise filter values separately from display formatting — `display_override` exists
 * for presentation only and is never filtered on.
 */
export const ProductAttributeValue = model
  .define("product_attribute_value", {
    id: model.id({ prefix: "attval" }).primaryKey(),
    product_id: model.text(),
    /** Required only for variant-scoped attributes; null means the value applies to the product. */
    variant_id: model.text().nullable(),
    attribute: model.belongsTo(() => AttributeDefinition, { mappedBy: "values" }),

    value_string: model.text().nullable(),
    /** Normalised numeric form for int/decimal, and the sortable form for enums where useful. */
    value_number: model.bigNumber().nullable(),
    value_bool: model.boolean().nullable(),
    /** Array of selected enum values for enum/multi_enum. */
    value_enum: model.json().nullable(),

    /** Presentation-only override, e.g. "16 GB (2x8 GB)". Never used for filtering. */
    display_override: model.text().nullable(),
    /** Where the value came from: manual entry, import batch id, supplier feed. */
    source: model.text().nullable(),
  })
  .indexes([
    { on: ["product_id"] },
    { on: ["variant_id"] },
    // Filtering hits attribute + normalised value most often.
    { on: ["attribute_id", "value_number"] },
    { on: ["attribute_id", "value_string"] },
  ]);
