import { model } from "@medusajs/framework/utils";
import { AttributeGroup } from "./attribute-group";
import { CategoryAttributeAssignment } from "./category-attribute-assignment";
import { ProductAttributeValue } from "./product-attribute-value";

/**
 * A reusable typed specification, e.g. `ram_gb`. Source of truth: 08_DATA_MODEL.md
 * section 3 and ADR-009 — typed definitions power filters, comparison and validation
 * instead of free-text descriptions.
 */
export const AttributeDefinition = model
  .define("attribute_definition", {
    id: model.id({ prefix: "attdef" }).primaryKey(),
    /** snake_case machine key, unique across the catalog. */
    key: model.text().unique().searchable(),
    name: model.text().searchable(),
    value_type: model.enum(["string", "int", "decimal", "bool", "enum", "multi_enum"]),
    /** Display unit such as GB, Hz, W. Never baked into the stored value. */
    unit: model.text().nullable(),
    /** Controlled list for enum/multi_enum types: [{ value, label }]. */
    enum_values: model.json().nullable(),
    filterable: model.boolean().default(false),
    comparable: model.boolean().default(true),
    searchable: model.boolean().default(false),
    /** True when the value differs per variant (storage, colour) rather than per product. */
    variant_scoped: model.boolean().default(false),
    /** Short helper shown to staff in the admin form. */
    description: model.text().nullable(),
    group: model.belongsTo(() => AttributeGroup, { mappedBy: "attributes" }).nullable(),
    assignments: model.hasMany(() => CategoryAttributeAssignment, { mappedBy: "attribute" }),
    values: model.hasMany(() => ProductAttributeValue, { mappedBy: "attribute" }),
  })
  .indexes([{ on: ["filterable"] }, { on: ["variant_scoped"] }]);
